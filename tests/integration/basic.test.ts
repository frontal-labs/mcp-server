import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConfig } from "@/config/index.js";
import { FrontalMcpServer } from "@/server/mcp-server.js";
import { createLogger } from "@/utils/logger.js";

describe("Frontal MCP Server Integration Tests", () => {
  let server: FrontalMcpServer;

  beforeEach(() => {
    const config = createConfig({
      apiKey: "test-api-key",
      baseUrl: "https://api.test.frontal.dev/v1",
    });
    const logger = createLogger({ level: "error" });

    server = new FrontalMcpServer(config, logger);
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  it("should initialize server successfully", async () => {
    await expect(server.initialize()).resolves.not.toThrow();
  });

  it("should have mcpServerInstance after initialization", async () => {
    await server.initialize();
    expect(server.mcpServerInstance).toBeDefined();
  });

  it("should handle basic protocol setup", async () => {
    await server.initialize();

    // Verify the underlying MCP server is properly configured
    const mcpServer = server.mcpServerInstance;
    expect(mcpServer).toBeDefined();
  });
});
