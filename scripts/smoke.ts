#!/usr/bin/env bun
/**
 * End-to-end smoke test for the Frontal MCP server.
 *
 * Two modes:
 *   - LIVE  — set FRONTAL_API_KEY (frt_...) and (optionally) FRONTAL_BASE_URL.
 *             Runs real requests against the configured host. Use once
 *             api.frontal.dev is live:  FRONTAL_API_KEY=frt_... bun run smoke
 *   - MOCK  — the default when no FRONTAL_API_KEY is set. Spins up a local HTTP
 *             server that mimics the edge contract (bearer auth, cursor
 *             pagination, x-ratelimit headers, google.rpc.Status errors) and
 *             drives the *real* MCP tool stack against it over a real socket,
 *             proving the wiring end-to-end without the live API.
 *
 * Exit code 0 on success, 1 on failure.
 */
import { createServer, type Server } from "node:http";
import { createConfig } from "../src/config/index.ts";
import { FrontalMcpServer } from "../src/server/mcp-server.ts";
import { createLogger } from "../src/utils/logger.ts";

const logger = createLogger({ level: "error" });
const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}\n`);
}

/** Minimal stand-in for the api.frontal.dev edge. */
function startMockEdge(): Promise<{ server: Server; baseUrl: string }> {
  const seenAuth: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const auth = req.headers.authorization;
    seenAuth.push(auth ?? "");
    res.setHeader("content-type", "application/json");
    res.setHeader("x-ratelimit-limit", "20");
    res.setHeader("x-ratelimit-remaining", "19");

    if (url.pathname === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (!auth?.startsWith("Bearer frt_")) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: { code: "unauthorized", message: "Missing or invalid API key" } }));
      return;
    }
    // Cursor-paginated list: page 1 -> next_cursor, page 2 -> done.
    if (url.pathname === "/v1/data/catalog/catalog/datasets") {
      const cursor = url.searchParams.get("cursor");
      res.writeHead(200);
      res.end(
        cursor
          ? JSON.stringify({ items: [{ id: "ds_2" }] })
          : JSON.stringify({ items: [{ id: "ds_1" }], next_cursor: "page2" })
      );
      return;
    }
    // Backend google.rpc.Status error shape.
    if (url.pathname === "/v1/data/query/query/federated") {
      res.writeHead(400);
      res.end(JSON.stringify({ code: "INVALID_ARGUMENT", message: "bad query", details: [{ field: "sql" }] }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: { code: "not_found", message: "no route" } }));
  });
  (server as Server & { seenAuth: string[] }).seenAuth = seenAuth;
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function callTool(
  server: FrontalMcpServer,
  name: string,
  args: Record<string, unknown>
) {
  const tool = (
    server.mcpServerInstance as unknown as {
      _registeredTools: Record<string, { handler: (a: unknown, e: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> }>;
    }
  )._registeredTools[name];
  return await tool.handler(args, {});
}

async function main() {
  const live = Boolean(process.env.FRONTAL_API_KEY);
  const mode = live ? "LIVE" : "MOCK";
  process.stdout.write(`Frontal MCP smoke test — ${mode} mode\n\n`);

  let mock: { server: Server; baseUrl: string } | undefined;
  if (!live) {
    mock = await startMockEdge();
    process.env.FRONTAL_BASE_URL = mock.baseUrl;
    process.env.FRONTAL_API_KEY = "frt_smoke_test_key";
  }

  const server = new FrontalMcpServer(
    createConfig({
      apiKey: process.env.FRONTAL_API_KEY,
      baseUrl: process.env.FRONTAL_BASE_URL,
    }),
    logger
  );
  await server.initialize();

  try {
    // 1. Discovery works offline from the vendored spec.
    const list = await callTool(server, "frontal_list_endpoints", { tag: "data", limit: 1 });
    const listData = JSON.parse(list.content[0].text) as { total: number };
    check("frontal_list_endpoints returns data ops", listData.total > 0, `${listData.total} ops`);

    // 2. Real HTTP round-trip through the tool -> client -> socket, with pagination.
    const paged = await callTool(server, "frontal_call_endpoint", {
      operationId: "getV1DataCatalogCatalogDatasets",
      autoPaginate: true,
    });
    if (live) {
      check("data list round-trip (live)", !paged.isError, paged.content[0].text.slice(0, 80));
    } else {
      const pages = (JSON.parse(paged.content[0].text) as { pages: unknown[] }).pages;
      check("cursor pagination followed across pages", pages.length === 2, `${pages.length} pages`);
    }

    // 3. Error envelope normalization (mock returns google.rpc.Status).
    const err = await callTool(server, "frontal_call_endpoint", {
      operationId: "postV1DataQueryQueryFederated",
      body: { sql: "x" },
    });
    if (live) {
      check("federated query reachable (live)", typeof err.isError === "boolean", err.content[0].text.slice(0, 80));
    } else {
      check(
        "backend error normalized to a clear message",
        err.isError === true && err.content[0].text.includes("bad query"),
        err.content[0].text.split("\n")[0]
      );
      const auths = (mock?.server as Server & { seenAuth: string[] }).seenAuth;
      check("bearer token sent on every upstream call", auths.every((a) => a.startsWith("Bearer frt_")), `${auths.length} calls`);
    }
  } finally {
    await server.close();
    mock?.server.close();
  }

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`smoke test crashed: ${(error as Error).message}\n`);
  process.exit(1);
});
