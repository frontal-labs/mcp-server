import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIAdapter } from "@/adapters/ai-adapter.js";
import { createConfig } from "@/config/index.js";
import { createLogger } from "@/utils/logger.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("AIAdapter", () => {
  let adapter: AIAdapter;
  let mockServer: { registerTool: ReturnType<typeof vi.fn> };
  let registeredHandlers: Map<string, (...args: unknown[]) => unknown>;

  beforeEach(async () => {
    registeredHandlers = new Map();
    mockServer = {
      registerTool: vi.fn(
        (name: string, _meta: unknown, handler: (...args: unknown[]) => unknown) => {
          registeredHandlers.set(name, handler);
        }
      ),
    };

    const config = createConfig({
      apiKey: "", // empty key = mock mode, no API calls
      baseUrl: "https://api.test.frontal.dev/v1",
    });
    const logger = createLogger({ level: "error" });

    adapter = new AIAdapter();
    await adapter.initialize(config, logger);
    adapter.registerTools(mockServer as unknown as McpServer);
  });

  it("should initialize successfully", () => {
    expect(adapter).toBeDefined();
    expect(adapter.name).toBe("ai");
  });

  it("should register three tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(3);
    expect(registeredHandlers.has("ai-generate-text")).toBe(true);
    expect(registeredHandlers.has("ai-generate-image")).toBe(true);
    expect(registeredHandlers.has("ai-embed")).toBe(true);
  });

  it("should generate text in mock mode", async () => {
    const handler = registeredHandlers.get("ai-generate-text")!;
    const result = await handler({
      model: "gpt-3.5-turbo",
      prompt: "Test prompt",
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.text).toContain("Test prompt");
    expect(parsed.model).toBe("gpt-3.5-turbo");
    expect(parsed.usage).toBeDefined();
  });

  it("should generate image in mock mode", async () => {
    const handler = registeredHandlers.get("ai-generate-image")!;
    const result = await handler({
      prompt: "A beautiful landscape",
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.url).toContain("frontal.dev");
    expect(parsed.prompt).toBe("A beautiful landscape");
  });

  it("should generate embeddings in mock mode", async () => {
    const handler = registeredHandlers.get("ai-embed")!;
    const result = await handler({
      text: "Sample text for embedding",
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("1536");
  });
});

describe("AIAdapter with API client", () => {
  let adapter: AIAdapter;
  let mockServer: { registerTool: ReturnType<typeof vi.fn> };
  let registeredHandlers: Map<string, (...args: unknown[]) => unknown>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    registeredHandlers = new Map();
    mockServer = {
      registerTool: vi.fn(
        (name: string, _meta: unknown, handler: (...args: unknown[]) => unknown) => {
          registeredHandlers.set(name, handler);
        }
      ),
    };

    mockFetch = vi.fn();
    global.fetch = mockFetch;

    const config = createConfig({
      apiKey: "test-api-key",
      baseUrl: "https://api.test.frontal.dev/v1",
    });
    const logger = createLogger({ level: "error" });

    adapter = new AIAdapter();
    await adapter.initialize(config, logger);
    adapter.registerTools(mockServer as unknown as McpServer);
  });

  it("should handle API errors gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const handler = registeredHandlers.get("ai-generate-text")!;
    const result = await handler({
      model: "gpt-3.5-turbo",
      prompt: "Test prompt",
    }) as { content: Array<{ type: string; text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error");
  });

  it("should handle network errors", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const handler = registeredHandlers.get("ai-generate-text")!;
    const result = await handler({
      model: "gpt-3.5-turbo",
      prompt: "Test prompt",
    }) as { content: Array<{ type: string; text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error");
  });
});
