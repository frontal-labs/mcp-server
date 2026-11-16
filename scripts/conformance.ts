#!/usr/bin/env bun
/*
 * Copyright 2026 Frontal Labs, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Runs the MCP conformance suite against the real HTTP transport, in both
 * protocol eras.
 *
 * The suite cannot send an `Authorization` header, and this server rejects
 * every unauthenticated MCP request. So the script puts a small local proxy
 * in front of the transport that adds a bearer token and forwards everything
 * else untouched (including `Host`, which the DNS-rebinding scenario
 * depends on).
 *
 * Only the scenarios that apply to this server are run. The rest of the
 * suite targets a reference "everything" server: its fixture tools, and
 * resources, prompts, sampling and logging, which this server does not have.
 * Add scenarios to `SCENARIOS` as the server grows those features.
 *
 * Usage: bun run conformance [--verbose]
 */
import { spawn } from "node:child_process";
import {
  createServer,
  type IncomingMessage,
  request,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { createConfig } from "../src/config/index.ts";
import { FrontalMcpServer } from "../src/mcp/index.ts";
import { HttpTransport } from "../src/middlewares/http-transport.ts";
import { createLogger } from "../src/utils/logger.ts";

const TOKEN = "frt_conformance_key";
const VERBOSE = process.argv.includes("--verbose");
/** One check line of the suite's output: `[check-id   ] SUCCESS ...`. */
const CHECK_LINE = /\[([a-z0-9-]+)\s*\]\s+(SUCCESS|FAILURE)/g;
/** ANSI colour sequences, which the suite prints around each status. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, "g");

interface EraPlan {
  era: string;
  scenarios: string[];
  specVersion: string;
}

/**
 * Checks that cannot run against this server because they call a fixture
 * tool of the suite's reference server (`test_missing_capability`,
 * `test_streaming_elicitation`, `test_logging_tool`). The suite reports them
 * as failures with "Not testable"; every other check of the scenario must
 * still pass.
 */
const NOT_TESTABLE: Record<string, string[]> = {
  "server-stateless": [
    "sep-2575-server-rejects-undeclared-capability",
    "sep-2575-missing-capability-http-400",
    "sep-2575-http-server-no-independent-requests-on-stream",
    "sep-2575-server-no-log-without-loglevel",
  ],
};

/*
 * Not run, because they need features this server does not have yet:
 * - json-schema-2020-12: needs the fixture tool `json_schema_2020_12_tool`.
 * - caching: also requires prompts/list and resources/list. Its tools/list
 *   check passes, and the smoke test asserts the same hints.
 */
const SCENARIOS: EraPlan[] = [
  {
    era: "legacy (2025-11-25)",
    specVersion: "2025-11-25",
    scenarios: [
      "server-initialize",
      "ping",
      "tools-list",
      "dns-rebinding-protection",
    ],
  },
  {
    era: "modern (2026-07-28)",
    specVersion: "2026-07-28",
    scenarios: [
      "server-stateless",
      "tools-list",
      "http-header-validation",
      "dns-rebinding-protection",
    ],
  },
];

interface Verdict {
  failures: string[];
  ok: boolean;
  passed: number;
  skipped: string[];
}

/**
 * Decide a scenario from the suite's own check lines. The CLI's exit code is
 * not reliable: on Windows it can crash while shutting down after a fully
 * passing run.
 */
function judge(scenario: string, output: string): Verdict {
  const allowed = new Set(NOT_TESTABLE[scenario] ?? []);
  const failures: string[] = [];
  const skipped: string[] = [];
  let passed = 0;
  for (const [, id, status] of output.replace(ANSI, "").matchAll(CHECK_LINE)) {
    if (status === "SUCCESS") passed++;
    else if (allowed.has(id)) skipped.push(id);
    else failures.push(id);
  }
  return { ok: passed > 0 && failures.length === 0, passed, failures, skipped };
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

/** Forward every request to `targetPort`, adding the bearer token. */
function createAuthProxy(targetPort: number): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const upstream = request(
      {
        host: "127.0.0.1",
        port: targetPort,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, authorization: `Bearer ${TOKEN}` },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
}

function runScenario(
  url: string,
  plan: EraPlan,
  scenario: string
): Promise<Verdict & { output: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "bunx",
      [
        "conformance",
        "server",
        "--url",
        url,
        "--scenario",
        scenario,
        "--spec-version",
        plan.specVersion,
      ],
      { shell: process.platform === "win32" }
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("close", () => resolve({ ...judge(scenario, output), output }));
    child.on("error", (error) =>
      resolve({
        ok: false,
        passed: 0,
        failures: [],
        skipped: [],
        output: String(error),
      })
    );
  });
}

function report(scenario: string, result: Verdict & { output: string }): void {
  const { ok, output, passed, skipped } = result;
  const note = skipped.length > 0 ? `, ${skipped.length} not testable` : "";
  process.stdout.write(
    `  ${ok ? "✓" : "✗"} ${scenario} (${passed} checks passed${note})\n`
  );
  if (!ok || VERBOSE) {
    process.stdout.write(`${output.trimEnd()}\n`);
  }
}

async function main(): Promise<void> {
  const logger = createLogger({ level: "error" });
  const server = new FrontalMcpServer(
    // No API key: like production HTTP, the token comes with each request.
    createConfig({ apiKey: "", baseUrl: "http://127.0.0.1:9" }),
    logger
  );
  await server.initialize();

  const transport = new HttpTransport(
    (request) => server.createServer(request),
    logger,
    {
      allowedHosts: ["127.0.0.1", "localhost"],
    }
  );
  const portProbe = createServer();
  const transportPort = await listen(portProbe);
  await new Promise<void>((done) => portProbe.close(() => done()));
  await transport.start(transportPort, "127.0.0.1");

  const proxy = createAuthProxy(transportPort);
  const proxyPort = await listen(proxy);
  const url = `http://127.0.0.1:${proxyPort}/mcp`;

  let failed = 0;
  let total = 0;
  try {
    for (const plan of SCENARIOS) {
      process.stdout.write(`\n${plan.era}\n`);
      for (const scenario of plan.scenarios) {
        total++;
        const result = await runScenario(url, plan, scenario);
        report(scenario, result);
        if (!result.ok) failed++;
      }
    }
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>((done) => proxy.close(() => done()));
    await transport.stop();
    await server.close();
  }

  process.stdout.write(
    `\n${total - failed}/${total} conformance scenarios passed\n`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `conformance run crashed: ${(error as Error).message}\n`
  );
  process.exit(1);
});
