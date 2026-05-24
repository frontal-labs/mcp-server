import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mustGet } from "@tests/utils/mock-factory.js";
import { PipelinesAdapter } from "@/adapters/pipelines-adapter.js";
import { createConfig } from "@/config/index.js";
import { createLogger } from "@/utils/logger.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

function createTestHarness() {
  const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const mockServer = {
    registerTool: vi.fn(
      (
        name: string,
        _meta: unknown,
        handler: (...args: unknown[]) => unknown
      ) => {
        registeredHandlers.set(name, handler);
      }
    ),
  };
  return { mockServer, registeredHandlers };
}

describe("PipelinesAdapter (mock mode)", () => {
  let adapter: PipelinesAdapter;
  let registeredHandlers: Map<string, (...args: unknown[]) => unknown>;
  let mockServer: { registerTool: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    ({ mockServer, registeredHandlers } = createTestHarness());
    const config = createConfig({ apiKey: "" });
    const logger = createLogger({ level: "error" });

    adapter = new PipelinesAdapter();
    await adapter.initialize(config, logger);
    adapter.registerTools(mockServer as unknown as McpServer);
  });

  it("should initialize with name 'pipelines'", () => {
    expect(adapter.name).toBe("pipelines");
  });

  it("should register two tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(2);
    expect(registeredHandlers.has("pipelines-create")).toBe(true);
    expect(registeredHandlers.has("pipelines-run")).toBe(true);
  });

  it("should create pipeline in mock mode", async () => {
    const handler = mustGet(registeredHandlers, "pipelines-create");
    const result = (await handler({
      name: "etl-pipeline",
      description: "Extract, transform, load",
      steps: [
        { action: "extract" },
        { action: "transform" },
        { action: "load" },
      ],
    })) as ToolResult;

    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe("etl-pipeline");
    expect(parsed.status).toBe("created");
    expect(parsed.steps).toHaveLength(3);
    expect(parsed.pipelineId).toContain("pipeline_");
  });

  it("should run pipeline in mock mode", async () => {
    const handler = mustGet(registeredHandlers, "pipelines-run");
    const result = (await handler({
      pipelineId: "pipeline_123",
      input: { source: "s3://data" },
    })) as ToolResult;

    expect(result.content[0].text).toContain("run_");
  });

  it("should run pipeline without input", async () => {
    const handler = mustGet(registeredHandlers, "pipelines-run");
    const result = (await handler({
      pipelineId: "pipeline_456",
    })) as ToolResult;

    expect(result.content[0].text).toContain("run_");
  });
});

describe("PipelinesAdapter (API mode)", () => {
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

    const adapter = new PipelinesAdapter();
    await adapter.initialize(config, logger);
    adapter.registerTools(mockServer as unknown as McpServer);
  });

  afterEach(() => vi.restoreAllMocks());

  it("should call API for create and return result", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          pipelineId: "pipe_1",
          name: "my-pipeline",
          description: "test",
          steps: [{ action: "process" }],
          status: "created",
          created: "2024-01-01T00:00:00Z",
        }),
    });

    const handler = mustGet(registeredHandlers, "pipelines-create");
    const result = (await handler({
      name: "my-pipeline",
      description: "test",
      steps: [{ action: "process" }],
    })) as ToolResult;

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.pipelineId).toBe("pipe_1");
  });

  it("should handle create API error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
    });

    const handler = mustGet(registeredHandlers, "pipelines-create");
    const result = (await handler({
      name: "",
      description: "",
      steps: [],
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error");
  });

  it("should call API for run with pipeline ID in URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          runId: "run_abc",
          pipelineId: "pipe_1",
          status: "running",
          started: "2024-01-01T12:00:00Z",
          input: { mode: "full" },
        }),
    });

    const handler = mustGet(registeredHandlers, "pipelines-run");
    const result = (await handler({
      pipelineId: "pipe_1",
      input: { mode: "full" },
    })) as ToolResult;

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.runId).toBe("run_abc");
    expect(parsed.status).toBe("running");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/pipelines/pipe_1/run");
  });

  it("should handle run network error", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const handler = mustGet(registeredHandlers, "pipelines-run");
    const result = (await handler({
      pipelineId: "pipe_1",
    })) as ToolResult;

    expect(result.isError).toBe(true);
  });
});
