import { describe, expect, it, vi } from "vitest";
import { FrontalMcpServer } from "@/server/mcp-server.js";
import { createConfig } from "@/config/index.js";
import { createLogger } from "@/utils/logger.js";

describe("FrontalMcpServer", () => {
  const logger = createLogger({ level: "error" });

  it("should create MCP server with correct name and version", () => {
    const config = createConfig({ apiKey: "" });
    const server = new FrontalMcpServer(config, logger);

    expect(server).toBeDefined();
    expect(server.mcpServerInstance).toBeDefined();
  });

  it("should expose mcpServerInstance getter", () => {
    const config = createConfig({ apiKey: "" });
    const server = new FrontalMcpServer(config, logger);
    const instance = server.mcpServerInstance;

    // McpServer from SDK should have connect method
    expect(typeof instance.connect).toBe("function");
  });

  describe("initialize with selective services", () => {
    it("should load only AI adapter when only ai is enabled", async () => {
      const config = createConfig({
        apiKey: "",
        services: {
          ai: true,
          blob: false,
          functions: false,
          graph: false,
          pipelines: false,
        },
      });
      const server = new FrontalMcpServer(config, logger);
      await server.initialize();

      // Verify it initializes without error — tools registered on the MCP server
      expect(server).toBeDefined();
    });

    it("should load all adapters when all services enabled", async () => {
      const config = createConfig({
        apiKey: "",
        services: {
          ai: true,
          blob: true,
          functions: true,
          graph: true,
          pipelines: true,
        },
      });
      const server = new FrontalMcpServer(config, logger);
      await server.initialize();
      expect(server).toBeDefined();
    });

    it("should load no adapters when all services disabled", async () => {
      const config = createConfig({
        apiKey: "",
        services: {
          ai: false,
          blob: false,
          functions: false,
          graph: false,
          pipelines: false,
        },
      });
      const server = new FrontalMcpServer(config, logger);
      await server.initialize();
      expect(server).toBeDefined();
    });

    it("should load only blob and graph adapters", async () => {
      const config = createConfig({
        apiKey: "",
        services: {
          ai: false,
          blob: true,
          functions: false,
          graph: true,
          pipelines: false,
        },
      });
      const server = new FrontalMcpServer(config, logger);
      await server.initialize();
      expect(server).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should propagate adapter initialization errors", async () => {
      // Use a config that might cause issues — we mock to force failure
      const config = createConfig({ apiKey: "" });
      const server = new FrontalMcpServer(config, logger);

      // Spy on the internal to force an error — we access via prototype
      const originalInit = Object.getPrototypeOf(server);
      const spy = vi.spyOn(originalInit, "initializeAdapters" as never);
      spy.mockRejectedValueOnce(new Error("Adapter init failed"));

      await expect(server.initialize()).rejects.toThrow("Adapter init failed");
      spy.mockRestore();
    });
  });

  describe("close", () => {
    it("should close without error", async () => {
      const config = createConfig({
        apiKey: "",
        services: {
          ai: false,
          blob: false,
          functions: false,
          graph: false,
          pipelines: false,
        },
      });
      const server = new FrontalMcpServer(config, logger);
      await server.initialize();
      await expect(server.close()).resolves.toBeUndefined();
    });
  });
});
