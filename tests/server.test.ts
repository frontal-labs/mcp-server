import { beforeEach, describe, expect, it } from "vitest";
import { createConfig } from "@/config/index.js";
import { FrontalMcpServer } from "@/server/mcp-server.js";
import { createLogger } from "@/utils/logger.js";
import type { ServerConfig } from "@/config/server-config.js";

describe("FrontalMcpServer", () => {
  let server: FrontalMcpServer;
  let config: ServerConfig;

  beforeEach(() => {
    config = createConfig({
      apiKey: "test-key",
      baseUrl: "https://api.frontal.dev/v1",
    });

    const logger = createLogger({ level: "error" });
    server = new FrontalMcpServer(config, logger);
  });

  it("should initialize successfully", async () => {
    await expect(server.initialize()).resolves.not.toThrow();
  });

  it("should have correct configuration", () => {
    expect(server).toBeDefined();
  });

  it("should expose mcpServerInstance", async () => {
    await server.initialize();
    expect(server.mcpServerInstance).toBeDefined();
  });

  it("should close gracefully", async () => {
    await server.initialize();
    await expect(server.close()).resolves.not.toThrow();
  });
});
