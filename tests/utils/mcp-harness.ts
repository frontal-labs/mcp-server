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
 * Shared helpers for tests that drive the server with a real MCP client.
 */
import { resolve } from "node:path";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { expect } from "vitest";
import { createConfig } from "@/config/index.js";
import { FrontalMcpServer } from "@/mcp/index.js";
import {
  HttpTransport,
  type HttpTransportOptions,
} from "@/middlewares/http-transport.js";
import type { RunKind } from "@/tasks/run-kinds.js";
import { createLogger } from "@/utils/logger.js";
import { getFreePort, type MockEdge } from "../mocks/mock-edge.js";

const REPO_ROOT = resolve(__dirname, "../..");

export const STDIO_TOKEN = "frt_smoke_stdio";
export const HTTP_TOKEN = "frt_smoke_http";
export const SPAWN_TIMEOUT_MS = 60_000;
export const MODERN_PROTOCOL_VERSION = "2026-07-28";

/** An answer to a form elicitation, as a user would give it. */
export type ElicitAnswer =
  | { action: "accept"; content: Record<string, boolean | number | string> }
  | { action: "cancel" | "decline" };

export interface ClientBehaviour {
  /**
   * When set, the client declares the elicitation capability and answers
   * each question with this function. When unset, it cannot be asked.
   */
  onElicit?: (message: string) => ElicitAnswer;
}

/** `legacy` is the 2025-era handshake; `modern` is revision 2026-07-28. */
export type Era = "legacy" | "modern";

export interface Harness {
  client: Client;
  close(): Promise<void>;
  era: Era;
  /** Token the mock API must see on calls made through this transport. */
  expectedToken: string;
}

export interface HttpServerUnderTest {
  stop(): Promise<void>;
  transport: HttpTransport;
  url: string;
}

/**
 * A client for one era. `modern` pins the revision, so a server that cannot
 * speak it fails the connection instead of silently falling back.
 */
export function newClient(era: Era, options: ClientBehaviour = {}): Client {
  const client = new Client(
    { name: "protocol-smoke", version: "0.0.0" },
    {
      capabilities: options.onElicit ? { elicitation: {} } : {},
      versionNegotiation: {
        mode: era === "modern" ? { pin: MODERN_PROTOCOL_VERSION } : "legacy",
      },
    }
  );
  const { onElicit } = options;
  if (onElicit) {
    client.setRequestHandler("elicitation/create", (request) =>
      onElicit(String(request.params.message))
    );
  }
  return client;
}

/** Spawn the real CLI over stdio; the API key comes from the environment. */
export async function connectStdio(
  edge: MockEdge,
  era: Era,
  behaviour: ClientBehaviour = {}
): Promise<Harness> {
  const client = newClient(era, behaviour);
  await client.connect(
    new StdioClientTransport({
      command: "bun",
      args: ["bin/index.ts", "--transport", "stdio", "--log-level", "error"],
      cwd: REPO_ROOT,
      env: {
        FRONTAL_API_KEY: STDIO_TOKEN,
        FRONTAL_BASE_URL: edge.baseUrl,
        MCP_LOG_LEVEL: "error",
      },
      stderr: "ignore",
    })
  );
  return {
    client,
    era,
    expectedToken: STDIO_TOKEN,
    close: () => client.close(),
  };
}

/** Start the real HTTP transport; the server holds no API key of its own. */
export async function startHttpServer(
  edge: MockEdge,
  options: HttpTransportOptions = {},
  config: Record<string, unknown> = {},
  runKinds?: readonly RunKind[]
): Promise<HttpServerUnderTest> {
  const logger = createLogger({ level: "error" });
  const server = new FrontalMcpServer(
    createConfig({ apiKey: "", baseUrl: edge.baseUrl, ...config }),
    logger,
    runKinds
  );
  await server.initialize();

  const port = await getFreePort();
  const http = new HttpTransport(
    (request) => server.createServer(request),
    logger,
    options
  );
  await http.start(port, "127.0.0.1");

  return {
    url: `http://127.0.0.1:${port}`,
    transport: http,
    stop: async () => {
      await http.stop();
      await server.close();
    },
  };
}

export async function connectHttp(
  url: string,
  era: Era,
  token = HTTP_TOKEN,
  behaviour: ClientBehaviour = {}
): Promise<Harness> {
  const client = newClient(era, behaviour);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    })
  );
  return {
    client,
    era,
    expectedToken: token,
    close: () => client.close(),
  };
}

/** The text of a tool result's first content block. */
export function textOf(result: unknown): string {
  const { content } = result as { content: { type: string; text: string }[] };
  expect(content[0]?.type).toBe("text");
  return content[0].text;
}
