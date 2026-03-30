import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIAdapter } from "@/adapters/ai-adapter.js";
import { createConfig } from "@/config/index.js";
import { createLogger } from "@/utils/logger.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("AIAdapter (Simple)", () => {
  let adapter: AIAdapter;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger({ level: "error" });
    adapter = new AIAdapter();
  });

  it("should initialize successfully", async () => {
    const config = createConfig({
      apiKey: "test-api-key",
      baseUrl: "https://api.test.frontal.dev/v1",
    });

    await adapter.initialize(config, logger);
    expect(adapter).toBeDefined();
  });

  it("should register tools", async () => {
    const config = createConfig({
      apiKey: "",
      baseUrl: "https://api.test.frontal.dev/v1",
    });
    await adapter.initialize(config, logger);

    const mockServer = {
      registerTool: vi.fn(),
    };

    adapter.registerTools(mockServer as unknown as McpServer);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "ai-generate-text",
      expect.any(Object),
      expect.any(Function)
    );
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "ai-generate-image",
      expect.any(Object),
      expect.any(Function)
    );
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "ai-embed",
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("should have correct name", () => {
    expect(adapter.name).toBe("ai");
  });

  it("should handle tool calls in mock mode", async () => {
    const config = createConfig({
      apiKey: "",
      baseUrl: "https://api.test.frontal.dev/v1",
    });
    await adapter.initialize(config, logger);

    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const mockServer = {
      registerTool: vi.fn(
        (name: string, _meta: unknown, handler: (...args: unknown[]) => unknown) => {
          handlers.set(name, handler);
        }
      ),
    };

    adapter.registerTools(mockServer as unknown as McpServer);

    const handler = handlers.get("ai-generate-text")!;
    const result = await handler({
      model: "gpt-3.5-turbo",
      prompt: "Test prompt",
    }) as { content: Array<{ type: string; text: string }> };

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
  });
});
