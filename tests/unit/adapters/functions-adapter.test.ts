import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsAdapter } from "@/adapters/functions-adapter.js";
import { createConfig } from "@/config/index.js";
import { createLogger } from "@/utils/logger.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

function createTestHarness() {
  const registeredHandlers = new Map<
    string,
    (...args: unknown[]) => unknown
  >();
  const mockServer = {
    registerTool: vi.fn(
      (
        name: string,
        _meta: unknown,
        handler: (...args: unknown[]) => unknown,
      ) => {
        registeredHandlers.set(name, handler);
      },
    ),
  };
  return { mockServer, registeredHandlers };
}

describe("FunctionsAdapter (mock mode)", () => {
  let adapter: FunctionsAdapter;
  let registeredHandlers: Map<string, (...args: unknown[]) => unknown>;
  let mockServer: { registerTool: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    ({ mockServer, registeredHandlers } = createTestHarness());
    const config = createConfig({ apiKey: "" });
    const logger = createLogger({ level: "error" });

    adapter = new FunctionsAdapter();
    await adapter.initialize(config, logger);
    adapter.registerTools(mockServer as unknown as McpServer);
  });

  it("should initialize with name 'functions'", () => {
    expect(adapter.name).toBe("functions");
  });

  it("should register two tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(2);
    expect(registeredHandlers.has("functions-invoke")).toBe(true);
    expect(registeredHandlers.has("functions-list")).toBe(true);
  });

  it("should invoke function synchronously in mock mode", async () => {
    const handler = registeredHandlers.get("functions-invoke")!;
    const result = (await handler({
      name: "process-data",
      payload: { key: "value" },
      invokeAsync: false,
    })) as ToolResult;

    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe("process-data");
    expect(parsed.status).toBe("completed");
    expect(parsed.executionTime).toBe(150);
  });

  it("should invoke function asynchronously in mock mode", async () => {
    const handler = registeredHandlers.get("functions-invoke")!;
    const result = (await handler({
      name: "long-task",
      payload: {},
      invokeAsync: true,
    })) as ToolResult;

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("pending");
    expect(parsed.result).toBeNull();
  });

  it("should list functions in mock mode", async () => {
    const handler = registeredHandlers.get("functions-list")!;
    const result = (await handler({ status: "all" })) as ToolResult;

    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("2 functions");
  });
});

describe("FunctionsAdapter (API mode)", () => {
  let registeredHandlers: Map<string, (...args: unknown[]) => unknown>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { mockServer, registeredHandlers: handlers } = createTestHarness();
    registeredHandlers = handlers;
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    const config = createConfig({
      apiKey: "test-key",
      baseUrl: "https://api.test.frontal.dev/v1",
    });
    const logger = createLogger({ level: "error" });

    const adapter = new FunctionsAdapter();
    await adapter.initialize(config, logger);
    adapter.registerTools(mockServer as unknown as McpServer);
  });

  afterEach(() => vi.restoreAllMocks());

  it("should call API for invoke and return result", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          functionId: "func_1",
          name: "my-func",
          status: "completed",
          result: "done",
          executionTime: 200,
          logs: ["ok"],
        }),
    });

    const handler = registeredHandlers.get("functions-invoke")!;
    const result = (await handler({
      name: "my-func",
      payload: { x: 1 },
      invokeAsync: false,
    })) as ToolResult;

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.functionId).toBe("func_1");
  });

  it("should handle invoke API error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const handler = registeredHandlers.get("functions-invoke")!;
    const result = (await handler({
      name: "broken",
      payload: {},
      invokeAsync: false,
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error");
  });

  it("should call API for list and return result", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          functions: [
            {
              id: "f1",
              name: "fn",
              status: "active",
              runtime: "nodejs18",
              memory: 256,
              timeout: 30,
              created: "2024-01-01",
            },
          ],
        }),
    });

    const handler = registeredHandlers.get("functions-list")!;
    const result = (await handler({ status: "active" })) as ToolResult;

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.functions).toHaveLength(1);
  });
});
