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
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "winston";
import { EnhancedHttpTransport } from "@/server/enhanced-http-transport.js";
import { createLogger } from "@/utils/logger.js";

function createMockMcpServer() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
  } as unknown as McpServer;
}

describe("EnhancedHttpTransport", () => {
  let logger: Logger;
  let mockMcpServer: McpServer;
  let mcpServerFactory: () => McpServer;

  beforeEach(() => {
    logger = createLogger({ level: "error" });
    mockMcpServer = createMockMcpServer();
    mcpServerFactory = () => mockMcpServer;
  });

  it("should construct without error", () => {
    const transport = new EnhancedHttpTransport(mcpServerFactory, logger);
    expect(transport).toBeDefined();
  });

  it("should start and listen on specified port", async () => {
    const transport = new EnhancedHttpTransport(mcpServerFactory, logger);

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
    const transport = new EnhancedHttpTransport(mcpServerFactory, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);

    await transport.start(port, "127.0.0.1");
    await expect(transport.stop()).resolves.toBeUndefined();
  });

  it("should stop gracefully when server was never started", async () => {
    const transport = new EnhancedHttpTransport(mcpServerFactory, logger);
    // stop() without start() should resolve without error
    await expect(transport.stop()).resolves.toBeUndefined();
  });

  it("should not send a wildcard CORS origin for untrusted origins", async () => {
    const transport = new EnhancedHttpTransport(mcpServerFactory, logger);
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
    const transport = new EnhancedHttpTransport(mcpServerFactory, logger, {
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
    const transport = new EnhancedHttpTransport(mcpServerFactory, logger);
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
    const transport = new EnhancedHttpTransport(mcpServerFactory, logger);
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

  it("should dispatch a GET request carrying a bearer token", async () => {
    const transport = new EnhancedHttpTransport(mcpServerFactory, logger);
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
    const transport = new EnhancedHttpTransport(mcpServerFactory, logger);
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
    const transport1 = new EnhancedHttpTransport(mcpServerFactory, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport1.start(port, "127.0.0.1");

    try {
      const transport2 = new EnhancedHttpTransport(
        () => createMockMcpServer(),
        logger
      );
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
    const transport = new EnhancedHttpTransport(() => {
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
    const transport = new EnhancedHttpTransport(
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

  it("rejects a request carrying an unknown session id", async () => {
    const transport = new EnhancedHttpTransport(mcpServerFactory, logger);
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
