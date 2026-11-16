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
 * Protocol smoke test: the regression net for the MCP 2026-07-28 migration.
 *
 * It drives the server the way a real client does, over both transports,
 * with a real MCP client and a real socket to a mock Frontal API:
 *
 * - stdio: the actual CLI entry point, spawned as a child process, with the
 *   API key taken from the `FRONTAL_API_KEY` environment variable;
 * - HTTP: the actual `HttpTransport`, with a per-request bearer token.
 *
 * Keep this file green in every phase. When the MCP client API changes,
 * update the two `connect*` helpers and leave the assertions alone.
 */
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConfig } from "@/config/index.js";
import { FrontalMcpServer } from "@/mcp/index.js";
import { HttpTransport } from "@/middlewares/http-transport.js";
import { createLogger } from "@/utils/logger.js";
import {
  getFreePort,
  MOCK_DATASETS,
  type MockEdge,
  startMockEdge,
} from "../mocks/mock-edge.js";

const REPO_ROOT = resolve(__dirname, "../..");
const STDIO_TOKEN = "frt_smoke_stdio";
const HTTP_TOKEN = "frt_smoke_http";
const SPAWN_TIMEOUT_MS = 30_000;

const GENERIC_TOOLS = [
  "frontal_list_endpoints",
  "frontal_describe_endpoint",
  "frontal_call_endpoint",
];
const CURATED_READ_TOOL = "data_list_datasets";
const DESCRIBED_OPERATION = "getV1DataCatalogCatalogDatasets";

interface Harness {
  client: Client;
  close(): Promise<void>;
  /** Token the mock API must see on calls made through this transport. */
  expectedToken: string;
}

function newClient(): Client {
  return new Client({ name: "protocol-smoke", version: "0.0.0" });
}

/** Spawn the real CLI over stdio; the API key comes from the environment. */
async function connectStdio(edge: MockEdge): Promise<Harness> {
  const client = newClient();
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["bin/index.ts", "--transport", "stdio", "--log-level", "error"],
    cwd: REPO_ROOT,
    env: {
      FRONTAL_API_KEY: STDIO_TOKEN,
      FRONTAL_BASE_URL: edge.baseUrl,
      MCP_LOG_LEVEL: "error",
    },
    stderr: "ignore",
  });
  await client.connect(transport);
  return {
    client,
    expectedToken: STDIO_TOKEN,
    close: () => client.close(),
  };
}

/** Start the real HTTP transport; the server holds no API key of its own. */
async function connectHttp(edge: MockEdge): Promise<Harness & { url: string }> {
  const logger = createLogger({ level: "error" });
  const server = new FrontalMcpServer(
    createConfig({ apiKey: "", baseUrl: edge.baseUrl }),
    logger
  );
  await server.initialize();

  const port = await getFreePort();
  const http = new HttpTransport(() => server.createServer(), logger);
  await http.start(port, "127.0.0.1");

  const url = `http://127.0.0.1:${port}`;
  const client = newClient();
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${HTTP_TOKEN}` } },
    })
  );

  return {
    client,
    url,
    expectedToken: HTTP_TOKEN,
    close: async () => {
      await client.close();
      await http.stop();
      await server.close();
    },
  };
}

function textOf(result: unknown): string {
  const { content } = result as { content: { type: string; text: string }[] };
  expect(content[0]?.type).toBe("text");
  return content[0].text;
}

describe("protocol smoke", () => {
  let edge: MockEdge;
  let httpUrl: string;
  const harnesses: Record<string, Harness> = {};

  beforeAll(async () => {
    edge = await startMockEdge();
    const [stdio, http] = await Promise.all([
      connectStdio(edge),
      connectHttp(edge),
    ]);
    harnesses.stdio = stdio;
    harnesses.http = http;
    httpUrl = http.url;
  }, SPAWN_TIMEOUT_MS);

  afterAll(async () => {
    await Promise.allSettled(
      Object.values(harnesses).map((harness) => harness.close())
    );
    await edge?.close();
  });

  describe.each(["stdio", "http"])("%s transport", (name) => {
    it("lists the generic tools and a curated tool", async () => {
      const { tools } = await harnesses[name].client.listTools();
      const names = tools.map((tool) => tool.name);

      for (const generic of GENERIC_TOOLS) {
        expect(names).toContain(generic);
      }
      expect(names).toContain(CURATED_READ_TOOL);
      for (const tool of tools) {
        expect(tool.inputSchema.type).toBe("object");
      }
    });

    it("describes an endpoint from the vendored spec without calling the API", async () => {
      const before = edge.requests.length;

      const result = await harnesses[name].client.callTool({
        name: "frontal_describe_endpoint",
        arguments: { operationId: DESCRIBED_OPERATION },
      });

      expect(result.isError).toBeFalsy();
      const described = JSON.parse(textOf(result));
      expect(described.operationId).toBe(DESCRIBED_OPERATION);
      expect(described.method).toBe("GET");
      expect(described.path).toBe("/v1/data/catalog/catalog/datasets");
      expect(edge.requests.length).toBe(before);
    });

    it("returns a tool error for an unknown operation", async () => {
      const result = await harnesses[name].client.callTool({
        name: "frontal_describe_endpoint",
        arguments: { operationId: "noSuchOperation" },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("Unknown operationId");
    });

    it("runs a curated read tool against the API with the caller's token", async () => {
      const before = edge.requests.length;

      const result = await harnesses[name].client.callTool({
        name: CURATED_READ_TOOL,
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      expect(JSON.parse(textOf(result))).toEqual({ items: MOCK_DATASETS });

      const upstream = edge.requests.slice(before);
      expect(upstream).toHaveLength(1);
      expect(upstream[0].method).toBe("GET");
      expect(upstream[0].path).toBe("/v1/data/catalog/catalog/datasets");
      expect(upstream[0].authorization).toBe(
        `Bearer ${harnesses[name].expectedToken}`
      );
    });
  });

  describe("http transport security posture", () => {
    it("serves GET /health without a token", async () => {
      const response = await fetch(`${httpUrl}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    });

    it("rejects an MCP request without a bearer token", async () => {
      const response = await fetch(`${httpUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
    });

    it("never answers CORS with a wildcard origin", async () => {
      const response = await fetch(`${httpUrl}/mcp`, {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example" },
      });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
  });
});
