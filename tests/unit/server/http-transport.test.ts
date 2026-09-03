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
import { request } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "winston";
import { HttpTransport } from "@/server/http-transport.js";
import { createLogger } from "@/utils/logger.js";

/**
 * Issue a request with an explicit Host header.
 *
 * `fetch` (undici) overrides Host with the connection target, so it cannot be
 * used to exercise host validation.
 */
function requestWithHost(
  port: number,
  path: string,
  host: string,
  method = "POST"
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          Host: host,
          "Content-Type": "application/json",
          Authorization: "Bearer frt_test",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on("error", reject);
    req.end(
      method === "POST"
        ? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
        : undefined
    );
  });
}

function createMockMcpServer() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
  } as unknown as McpServer;
}

describe("HttpTransport", () => {
  let logger: Logger;
  let mockMcpServer: McpServer;
  let mcpServerFactory: () => McpServer;

  beforeEach(() => {
    logger = createLogger({ level: "error" });
    mockMcpServer = createMockMcpServer();
    mcpServerFactory = () => mockMcpServer;
  });

  it("should construct without error", () => {
    const transport = new HttpTransport(mcpServerFactory, logger);
    expect(transport).toBeDefined();
  });

  it("should start and listen on specified port", async () => {
    const transport = new HttpTransport(mcpServerFactory, logger);

    // Use a random high port to avoid conflicts
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      // The listener is up...
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);

      // ...but no MCP server is connected yet. Servers are created per
      // session on `initialize`, not once at startup — binding a single
      // server at startup would let only the first client connect.
      expect(mockMcpServer.connect).not.toHaveBeenCalled();
    } finally {
      await transport.stop();
    }
  });

  it("should stop gracefully when server is running", async () => {
    const transport = new HttpTransport(mcpServerFactory, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);

    await transport.start(port, "127.0.0.1");
    await expect(transport.stop()).resolves.toBeUndefined();
  });

  it("should stop gracefully when server was never started", async () => {
    const transport = new HttpTransport(mcpServerFactory, logger);
    // stop() without start() should resolve without error
    await expect(transport.stop()).resolves.toBeUndefined();
  });

  it("should not send a wildcard CORS origin for untrusted origins", async () => {
    const transport = new HttpTransport(mcpServerFactory, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      // OPTIONS preflight from an origin that is not on the allowlist.
      const response = await fetch(`http://127.0.0.1:${port}`, {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example" },
      });

      expect(response.status).toBe(200);
      // No wildcard, and the untrusted origin is not echoed back.
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(response.headers.get("access-control-allow-methods")).toContain(
        "POST"
      );
      expect(response.headers.get("access-control-allow-headers")).toContain(
        "Content-Type"
      );
    } finally {
      await transport.stop();
    }
  });

  it("should echo a configured trusted CORS origin", async () => {
    const transport = new HttpTransport(mcpServerFactory, logger, {
      allowedOrigins: ["https://trusted.example"],
    });
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      const response = await fetch(`http://127.0.0.1:${port}`, {
        method: "OPTIONS",
        headers: { Origin: "https://trusted.example" },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://trusted.example"
      );
    } finally {
      await transport.stop();
    }
  });

  it("should reject MCP requests without a bearer token with 401", async () => {
    const transport = new HttpTransport(mcpServerFactory, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      const response = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe("unauthorized");
    } finally {
      await transport.stop();
    }
  });

  it("should serve GET /health", async () => {
    const transport = new HttpTransport(mcpServerFactory, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      const data = (await response.json()) as { status: string };
      expect(data.status).toBe("ok");
    } finally {
      await transport.stop();
    }
  });

  it("should serve HEAD /health without authentication", async () => {
    // Container and load-balancer probes send HEAD (`wget --spider` does).
    // If this falls through to the MCP path it answers 401 and the
    // orchestrator restarts a perfectly healthy server.
    const transport = new HttpTransport(mcpServerFactory, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        method: "HEAD",
      });
      expect(response.status).toBe(200);
    } finally {
      await transport.stop();
    }
  });

  it("should dispatch a GET request carrying a bearer token", async () => {
    const transport = new HttpTransport(mcpServerFactory, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");
    try {
      // A bare GET (not /health) flows through the MCP dispatch path with the
      // per-request Authorization header extracted; the response is defined.
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { Authorization: "Bearer frt_test" },
      });
      expect(typeof response.status).toBe("number");
    } finally {
      await transport.stop();
    }
  });

  it("should handle malformed JSON with 500 error", async () => {
    const transport = new HttpTransport(mcpServerFactory, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      const response = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Authenticated so the request reaches JSON parsing (not the 401 gate).
          Authorization: "Bearer frt_test",
        },
        body: "not valid json{{{",
      });

      expect(response.status).toBe(500);
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe("Internal server error");
    } finally {
      await transport.stop();
    }
  });

  it("should reject starting on an already-used port", async () => {
    const transport1 = new HttpTransport(mcpServerFactory, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport1.start(port, "127.0.0.1");

    try {
      const transport2 = new HttpTransport(() => createMockMcpServer(), logger);
      await expect(transport2.start(port, "127.0.0.1")).rejects.toThrow();
    } finally {
      await transport1.stop();
    }
  });

  it("gives each client its own session instead of rejecting the second", async () => {
    // Regression: a single shared StreamableHTTPServerTransport made the
    // second and every later client fail with "Server already initialized",
    // so only one tenant could ever use an HTTP deployment.
    const created: McpServer[] = [];
    const transport = new HttpTransport(() => {
      const server = new McpServer({ name: "test", version: "0.0.0" });
      created.push(server);
      return server;
    }, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    const initialize = (token: string) =>
      fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "probe", version: "0.0.0" },
          },
        }),
      });

    try {
      const first = await initialize("frt_tenant_a");
      const second = await initialize("frt_tenant_b");

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      // Distinct sessions, each backed by its own server instance.
      const firstId = first.headers.get("mcp-session-id");
      const secondId = second.headers.get("mcp-session-id");
      expect(firstId).toBeTruthy();
      expect(secondId).toBeTruthy();
      expect(firstId).not.toBe(secondId);
      expect(created).toHaveLength(2);
    } finally {
      await transport.stop();
    }
  });

  it("closes sessions that go idle past the timeout", async () => {
    // A client that crashes or drops off the network never sends DELETE, so
    // sessions must also expire on their own or they accumulate forever.
    const transport = new HttpTransport(
      () => new McpServer({ name: "test", version: "0.0.0" }),
      logger,
      { sessionIdleTimeoutMs: 1, sessionSweepIntervalMs: 10 }
    );
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer frt_test",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "probe", version: "0.0.0" },
          },
        }),
      });
      const sessionId = response.headers.get("mcp-session-id");
      expect(sessionId).toBeTruthy();
      await response.body?.cancel();

      // Wait for a sweep to evict the now-idle session.
      await vi.waitFor(
        async () => {
          const followUp = await fetch(`http://127.0.0.1:${port}/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer frt_test",
              "Mcp-Session-Id": sessionId as string,
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/list",
            }),
          });
          expect(followUp.status).toBe(404);
        },
        { timeout: 3000, interval: 50 }
      );
    } finally {
      await transport.stop();
    }
  });

  it("rejects an untrusted Host header when a host allowlist is set", async () => {
    // DNS rebinding: an attacker resolves a hostname they control to this
    // server, so the victim's browser treats the response as same-origin and
    // CORS never applies. The requested Host is what gives it away.
    const transport = new HttpTransport(mcpServerFactory, logger, {
      allowedHosts: ["mcp.example.com"],
    });
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      const rejected = await requestWithHost(port, "/", "attacker.example");
      expect(rejected.status).toBe(403);
      expect(JSON.parse(rejected.body).error).toBe("forbidden");

      // An allowed host passes the check, with or without a port.
      for (const host of ["mcp.example.com", "mcp.example.com:8443"]) {
        const allowed = await requestWithHost(port, "/", host);
        expect(allowed.status).not.toBe(403);
      }

      // Probes address the container directly, so /health stays reachable.
      const health = await requestWithHost(
        port,
        "/health",
        "attacker.example",
        "GET"
      );
      expect(health.status).toBe(200);
    } finally {
      await transport.stop();
    }
  });

  it("allows any Host when no allowlist is configured", async () => {
    const transport = new HttpTransport(mcpServerFactory, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      const response = await requestWithHost(port, "/", "anything.example");
      expect(response.status).not.toBe(403);
    } finally {
      await transport.stop();
    }
  });

  it("returns 429 with retry headers once the rate limit is exhausted", async () => {
    const reset = Date.now() + 30_000;
    let calls = 0;
    const rateLimiter = {
      limit: vi.fn(() => {
        calls++;
        return Promise.resolve({
          success: calls <= 2,
          limit: 2,
          remaining: Math.max(0, 2 - calls),
          reset,
        });
      }),
    };
    const transport = new HttpTransport(mcpServerFactory, logger, {
      rateLimiter,
    });
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    const send = () =>
      fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer frt_test",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });

    try {
      const first = await send();
      expect(first.status).not.toBe(429);
      expect(first.headers.get("ratelimit-limit")).toBe("2");

      await send();
      const limited = await send();

      expect(limited.status).toBe(429);
      expect(limited.headers.get("ratelimit-remaining")).toBe("0");
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
      const body = (await limited.json()) as { error: { message: string } };
      expect(body.error.message).toContain("Rate limit exceeded");
    } finally {
      await transport.stop();
    }
  });

  it("keeps serving when the rate limiter throws", async () => {
    // A rate-limiter outage must not become an outage of the whole server.
    const rateLimiter = {
      limit: vi.fn(() => Promise.reject(new Error("redis unreachable"))),
    };
    const transport = new HttpTransport(mcpServerFactory, logger, {
      rateLimiter,
    });
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer frt_test",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      expect(response.status).not.toBe(429);
      expect(response.status).not.toBe(500);
      expect(rateLimiter.limit).toHaveBeenCalled();
    } finally {
      await transport.stop();
    }
  });

  it("rate limits each caller separately", async () => {
    const seen: string[] = [];
    const rateLimiter = {
      limit: (identifier: string) => {
        seen.push(identifier);
        return Promise.resolve({
          success: true,
          limit: 10,
          remaining: 9,
          reset: Date.now() + 1000,
        });
      },
    };
    const transport = new HttpTransport(mcpServerFactory, logger, {
      rateLimiter,
    });
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    const send = (token: string) =>
      fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });

    try {
      await send("frt_tenant_a");
      await send("frt_tenant_b");
      await send("frt_tenant_a");

      expect(seen).toHaveLength(3);
      // Same caller maps to one bucket, different callers to different ones.
      expect(seen[0]).toBe(seen[2]);
      expect(seen[0]).not.toBe(seen[1]);
      // The raw bearer token is never used as the key.
      expect(seen[0]).not.toContain("frt_tenant_a");
    } finally {
      await transport.stop();
    }
  });

  it("refuses new sessions once the session limit is reached", async () => {
    // Each session holds its own McpServer, so unbounded session creation is
    // a memory-exhaustion vector; the process should degrade with 503 rather
    // than run out of memory.
    const transport = new HttpTransport(
      () => new McpServer({ name: "test", version: "0.0.0" }),
      logger,
      { maxSessions: 2 }
    );
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    const initialize = () =>
      fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer frt_test",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "probe", version: "0.0.0" },
          },
        }),
      });

    try {
      const first = await initialize();
      const second = await initialize();
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      await first.body?.cancel();
      await second.body?.cancel();

      const third = await initialize();
      expect(third.status).toBe(503);
      expect(third.headers.get("retry-after")).toBe("60");
      const data = (await third.json()) as { error: { message: string } };
      expect(data.error.message).toContain("session limit");

      // The server is still healthy for everyone else.
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status).toBe(200);
    } finally {
      await transport.stop();
    }
  });

  it("rejects an oversized body declared by content-length", async () => {
    // The body is buffered before the session is resolved, so an unbounded
    // read lets one caller exhaust the process.
    const transport = new HttpTransport(mcpServerFactory, logger, {
      maxRequestBodyBytes: 1024,
    });
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer frt_test",
        },
        body: JSON.stringify({ pad: "A".repeat(4096) }),
      });

      expect(response.status).toBe(413);
      const data = (await response.json()) as { error: string };
      expect(data.error).toBe("payload_too_large");
    } finally {
      await transport.stop();
    }
  });

  it("accepts a body within the size limit", async () => {
    const transport = new HttpTransport(mcpServerFactory, logger, {
      maxRequestBodyBytes: 1024,
    });
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer frt_test",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });

      // Reaches session routing rather than being rejected on size.
      expect(response.status).not.toBe(413);
    } finally {
      await transport.stop();
    }
  });

  it("rejects a request carrying an unknown session id", async () => {
    const transport = new HttpTransport(mcpServerFactory, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer frt_test",
          "Mcp-Session-Id": "00000000-0000-4000-8000-000000000000",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });

      expect(response.status).toBe(404);
      const data = (await response.json()) as {
        error: { code: number; message: string };
      };
      expect(data.error.message).toContain("initialize");
    } finally {
      await transport.stop();
    }
  });
});
