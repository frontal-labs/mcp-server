import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlobAdapter } from "@/adapters/blob-adapter.js";
import { createConfig } from "@/config/index.js";
import { createLogger } from "@/utils/logger.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("BlobAdapter", () => {
  let adapter: BlobAdapter;
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
      apiKey: "", // mock mode
      baseUrl: "https://api.test.frontal.dev/v1",
    });
    const logger = createLogger({ level: "error" });

    adapter = new BlobAdapter();
    await adapter.initialize(config, logger);
    adapter.registerTools(mockServer as unknown as McpServer);
  });

  it("should initialize successfully", () => {
    expect(adapter).toBeDefined();
    expect(adapter.name).toBe("blob");
  });

  it("should register two tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(2);
    expect(registeredHandlers.has("blob-upload")).toBe(true);
    expect(registeredHandlers.has("blob-list")).toBe(true);
  });

  it("should upload file in mock mode", async () => {
    const handler = registeredHandlers.get("blob-upload")!;
    const result = await handler({
      bucket: "uploads",
      key: "test-file.txt",
      content: "test content",
      contentType: "text/plain",
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.bucket).toBe("uploads");
    expect(parsed.key).toBe("test-file.txt");
    expect(parsed.url).toContain("frontal.dev");
  });

  it("should list objects in mock mode", async () => {
    const handler = registeredHandlers.get("blob-list")!;
    const result = await handler({
      bucket: "uploads",
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("objects");
  });
});

describe("BlobAdapter with API client", () => {
  let adapter: BlobAdapter;
  let registeredHandlers: Map<string, (...args: unknown[]) => unknown>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    registeredHandlers = new Map();
    const mockServer = {
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

    adapter = new BlobAdapter();
    await adapter.initialize(config, logger);
    adapter.registerTools(mockServer as unknown as McpServer);
  });

  it("should handle upload errors gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 413,
      statusText: "Payload Too Large",
    });

    const handler = registeredHandlers.get("blob-upload")!;
    const result = await handler({
      bucket: "uploads",
      key: "large-file.txt",
      content: "large content",
    }) as { content: Array<{ type: string; text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error");
  });

  it("should handle list errors gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const handler = registeredHandlers.get("blob-list")!;
    const result = await handler({
      bucket: "uploads",
    }) as { content: Array<{ type: string; text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error");
  });
});
