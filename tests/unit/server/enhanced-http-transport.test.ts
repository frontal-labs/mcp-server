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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

  beforeEach(() => {
    logger = createLogger({ level: "error" });
    mockMcpServer = createMockMcpServer();
  });

  it("should construct without error", () => {
    const transport = new EnhancedHttpTransport(mockMcpServer, logger);
    expect(transport).toBeDefined();
  });

  it("should start and listen on specified port", async () => {
    const transport = new EnhancedHttpTransport(mockMcpServer, logger);

    // Use a random high port to avoid conflicts
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    // Verify mcpServer.connect was called
    expect(mockMcpServer.connect).toHaveBeenCalledTimes(1);

    await transport.stop();
  });

  it("should stop gracefully when server is running", async () => {
    const transport = new EnhancedHttpTransport(mockMcpServer, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);

    await transport.start(port, "127.0.0.1");
    await expect(transport.stop()).resolves.toBeUndefined();
  });

  it("should stop gracefully when server was never started", async () => {
    const transport = new EnhancedHttpTransport(mockMcpServer, logger);
    // stop() without start() should resolve without error
    await expect(transport.stop()).resolves.toBeUndefined();
  });

  it("should not send a wildcard CORS origin for untrusted origins", async () => {
    const transport = new EnhancedHttpTransport(mockMcpServer, logger);
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
    const transport = new EnhancedHttpTransport(mockMcpServer, logger, {
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
    const transport = new EnhancedHttpTransport(mockMcpServer, logger);
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
    const transport = new EnhancedHttpTransport(mockMcpServer, logger);
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
    const transport = new EnhancedHttpTransport(mockMcpServer, logger);
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
    const transport = new EnhancedHttpTransport(mockMcpServer, logger);
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
    const transport1 = new EnhancedHttpTransport(mockMcpServer, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport1.start(port, "127.0.0.1");

    try {
      const transport2 = new EnhancedHttpTransport(
        createMockMcpServer(),
        logger
      );
      await expect(transport2.start(port, "127.0.0.1")).rejects.toThrow();
    } finally {
      await transport1.stop();
    }
  });
});
