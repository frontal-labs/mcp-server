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
 * It drives the server the way a real client does, with a real MCP client
 * and a real socket to a mock Frontal API, over both transports and in both
 * protocol eras:
 *
 * - stdio: the actual CLI entry point, spawned as a child process, with the
 *   API key taken from the `FRONTAL_API_KEY` environment variable;
 * - HTTP: the actual `HttpTransport`, with a per-request bearer token;
 * - legacy: the 2025-era `initialize` handshake;
 * - modern: protocol revision 2026-07-28, pinned so that a silent fallback
 *   to the legacy handshake fails the test.
 *
 * Keep this file green in every phase. When the MCP client API changes,
 * update the helpers in `tests/utils/mcp-harness.ts` and leave the
 * assertions alone.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VERSION } from "@/version.js";
import {
  MOCK_DATASETS,
  type MockEdge,
  startMockEdge,
} from "../mocks/mock-edge.js";
import {
  connectHttp,
  connectStdio,
  type Harness,
  HTTP_TOKEN,
  type HttpServerUnderTest,
  MODERN_PROTOCOL_VERSION,
  SPAWN_TIMEOUT_MS,
  startHttpServer,
  textOf,
} from "../utils/mcp-harness.js";

const GENERIC_TOOLS = [
  "frontal_list_endpoints",
  "frontal_describe_endpoint",
  "frontal_call_endpoint",
];
const CURATED_READ_TOOL = "data_list_datasets";
const DESCRIBED_OPERATION = "getV1DataCatalogCatalogDatasets";

const CASES = [
  "stdio legacy",
  "stdio modern",
  "http legacy",
  "http modern",
] as const;

describe("protocol smoke", () => {
  let edge: MockEdge;
  let httpServer: HttpServerUnderTest;
  const harnesses: Record<string, Harness> = {};

  beforeAll(async () => {
    edge = await startMockEdge();
    httpServer = await startHttpServer(edge);
    const [stdioLegacy, stdioModern, httpLegacy, httpModern] =
      await Promise.all([
        connectStdio(edge, "legacy"),
        connectStdio(edge, "modern"),
        connectHttp(httpServer.url, "legacy"),
        connectHttp(httpServer.url, "modern"),
      ]);
    harnesses["stdio legacy"] = stdioLegacy;
    harnesses["stdio modern"] = stdioModern;
    harnesses["http legacy"] = httpLegacy;
    harnesses["http modern"] = httpModern;
  }, SPAWN_TIMEOUT_MS);

  afterAll(async () => {
    await Promise.allSettled(
      Object.values(harnesses).map((harness) => harness.close())
    );
    await httpServer?.stop();
    await edge?.close();
  });

  describe.each(CASES)("%s", (name) => {
    it("negotiates the expected protocol era and identifies the server", () => {
      const { client, era } = harnesses[name];
      expect(client.getProtocolEra()).toBe(era);
      if (era === "modern") {
        expect(client.getNegotiatedProtocolVersion()).toBe(
          MODERN_PROTOCOL_VERSION
        );
      }
      expect(client.getServerVersion()).toMatchObject({
        name: "frontal-mcp-server",
        version: VERSION,
      });
      expect(client.getServerCapabilities()?.tools).toBeDefined();
    });

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
      const response = await fetch(`${httpServer.url}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    });

    it("rejects an MCP request without a bearer token", async () => {
      const response = await fetch(`${httpServer.url}/mcp`, {
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
      const response = await fetch(`${httpServer.url}/mcp`, {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example" },
      });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("answers the retired session operations with 405", async () => {
      for (const method of ["GET", "DELETE"]) {
        const response = await fetch(`${httpServer.url}/mcp`, {
          method,
          headers: {
            Authorization: `Bearer ${HTTP_TOKEN}`,
            Accept: "text/event-stream",
          },
        });
        expect(response.status).toBe(405);
      }
    });
  });
});
