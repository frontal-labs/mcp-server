import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mustGet } from "@tests/utils/mock-factory.js";
import { GraphAdapter } from "@/adapters/graph-adapter.js";
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

describe("GraphAdapter (mock mode)", () => {
  let adapter: GraphAdapter;
  let registeredHandlers: Map<string, (...args: unknown[]) => unknown>;
  let mockServer: { registerTool: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    ({ mockServer, registeredHandlers } = createTestHarness());
    const config = createConfig({ apiKey: "" });
    const logger = createLogger({ level: "error" });

    adapter = new GraphAdapter();
    await adapter.initialize(config, logger);
    adapter.registerTools(mockServer as unknown as McpServer);
  });

  it("should initialize with name 'graph'", () => {
    expect(adapter.name).toBe("graph");
  });

  it("should register two tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(2);
    expect(registeredHandlers.has("graph-query")).toBe(true);
    expect(registeredHandlers.has("graph-create-node")).toBe(true);
  });

  it("should execute graph query in mock mode", async () => {
    const handler = mustGet(registeredHandlers, "graph-query");
    const result = (await handler({
      query: "MATCH (n) RETURN n",
    })) as ToolResult;

    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("2 nodes");
    expect(result.content[0].text).toContain("1 edges");
  });

  it("should accept optional variables in query", async () => {
    const handler = mustGet(registeredHandlers, "graph-query");
    const result = (await handler({
      query: "MATCH (n:User) WHERE n.age > $age RETURN n",
      variables: { age: 18 },
    })) as ToolResult;

    expect(result.content[0].text).toContain("nodes");
  });

  it("should create node in mock mode", async () => {
    const handler = mustGet(registeredHandlers, "graph-create-node");
    const result = (await handler({
      type: "Person",
      properties: { name: "Alice", age: 30 },
    })) as ToolResult;

    expect(result.content[0].text).toContain("Created Person node");
    expect(result.content[0].text).toContain("node_");
  });
});

describe("GraphAdapter (API mode)", () => {
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

    const adapter = new GraphAdapter();
    await adapter.initialize(config, logger);
    adapter.registerTools(mockServer as unknown as McpServer);
  });

  afterEach(() => vi.restoreAllMocks());

  it("should call API for query and return JSON result", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            nodes: [
              { id: "n1", type: "User", properties: { name: "Alice" } },
            ],
            edges: [{ from: "n1", to: "n2", type: "KNOWS" }],
          },
          executionTime: 30,
        }),
    });

    const handler = mustGet(registeredHandlers, "graph-query");
    const result = (await handler({
      query: "MATCH (n) RETURN n",
    })) as ToolResult;

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.nodes).toHaveLength(1);
    expect(parsed.executionTime).toBe(30);
  });

  it("should handle query API error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    });

    const handler = mustGet(registeredHandlers, "graph-query");
    const result = (await handler({
      query: "INVALID QUERY",
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error");
  });

  it("should call API for create-node", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          nodeId: "node_abc",
          type: "Document",
          properties: { title: "Report" },
          created: "2024-01-01T00:00:00Z",
        }),
    });

    const handler = mustGet(registeredHandlers, "graph-create-node");
    const result = (await handler({
      type: "Document",
      properties: { title: "Report" },
    })) as ToolResult;

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.nodeId).toBe("node_abc");
    expect(parsed.type).toBe("Document");
  });

  it("should handle create-node network error", async () => {
    mockFetch.mockRejectedValue(new Error("timeout"));

    const handler = mustGet(registeredHandlers, "graph-create-node");
    const result = (await handler({
      type: "Task",
      properties: { title: "Todo" },
    })) as ToolResult;

    expect(result.isError).toBe(true);
  });
});
