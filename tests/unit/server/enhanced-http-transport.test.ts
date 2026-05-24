import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnhancedHttpTransport } from "@/server/enhanced-http-transport.js";
import { createLogger } from "@/utils/logger.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "winston";

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

  it("should set CORS headers on requests", async () => {
    const transport = new EnhancedHttpTransport(mockMcpServer, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      // Send an OPTIONS request to check CORS
      const response = await fetch(`http://127.0.0.1:${port}`, {
        method: "OPTIONS",
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
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

  it("should handle malformed JSON with 500 error", async () => {
    const transport = new EnhancedHttpTransport(mockMcpServer, logger);
    const port = 30000 + Math.floor(Math.random() * 10000);
    await transport.start(port, "127.0.0.1");

    try {
      const response = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
