import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, FrontalApiClient } from "@/services/api-client.js";
import { createLogger } from "@/utils/logger.js";
import type { Logger } from "winston";

describe("FrontalApiClient", () => {
  let client: FrontalApiClient;
  let logger: Logger;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logger = createLogger({ level: "error" });
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    client = new FrontalApiClient(
      "https://api.test.frontal.dev/v1",
      "test-api-key",
      logger,
      { maxAttempts: 2, baseDelay: 10, maxDelay: 50, jitter: false },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Request formatting ---

  describe("request formatting", () => {
    it("should send correct headers with Bearer token", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            text: "hello",
            model: "gpt-4",
            usage: {
              promptTokens: 5,
              completionTokens: 10,
              totalTokens: 15,
            },
          }),
      });

      await client.generateText({ model: "gpt-4", prompt: "hi" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.test.frontal.dev/v1/ai/generate-text");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers.Authorization).toBe("Bearer test-api-key");
      expect(options.headers["X-Request-ID"]).toBeDefined();
    });

    it("should JSON-serialize the request body", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            text: "response",
            model: "gpt-4",
            usage: {
              promptTokens: 1,
              completionTokens: 1,
              totalTokens: 2,
            },
          }),
      });

      await client.generateText({
        model: "gpt-4",
        prompt: "test",
        maxTokens: 100,
        temperature: 0.7,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe("gpt-4");
      expect(body.prompt).toBe("test");
      expect(body.maxTokens).toBe(100);
      expect(body.temperature).toBe(0.7);
    });

    it("should not send body for GET requests", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            objects: [],
            truncated: false,
          }),
      });

      await client.listBlobs({ bucket: "test-bucket" });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/blob/list?bucket=test-bucket");
      expect(options.method).toBe("GET");
      expect(options.body).toBeUndefined();
    });
  });

  // --- Retry logic ---

  describe("retry logic", () => {
    it("should retry on 500 errors up to maxAttempts", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              text: "recovered",
              model: "gpt-4",
              usage: {
                promptTokens: 1,
                completionTokens: 1,
                totalTokens: 2,
              },
            }),
        });

      const result = await client.generateText({
        model: "gpt-4",
        prompt: "test",
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.text).toBe("recovered");
    });

    it("should not retry on 4xx errors", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      });

      await expect(
        client.generateText({ model: "gpt-4", prompt: "test" }),
      ).rejects.toThrow(ApiError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should throw after exhausting all retries", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
      });

      await expect(
        client.generateText({ model: "gpt-4", prompt: "test" }),
      ).rejects.toThrow(ApiError);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should retry on network errors (ECONNRESET)", async () => {
      const networkErr = new Error("Connection reset");
      (networkErr as NodeJS.ErrnoException).code = "ECONNRESET";

      mockFetch
        .mockRejectedValueOnce(networkErr)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              text: "ok",
              model: "m",
              usage: {
                promptTokens: 1,
                completionTokens: 1,
                totalTokens: 2,
              },
            }),
        });

      const result = await client.generateText({
        model: "m",
        prompt: "test",
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.text).toBe("ok");
    });
  });

  // --- Error handling ---

  describe("error handling", () => {
    it("should wrap HTTP errors in ApiError with status code", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      try {
        await client.generateText({ model: "gpt-4", prompt: "test" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.statusCode).toBe(404);
        expect(apiErr.message).toContain("Request failed");
        expect(apiErr.retryable).toBe(false);
      }
    });

    it("should mark 5xx errors as retryable", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      try {
        await client.generateText({ model: "gpt-4", prompt: "test" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        const apiErr = err as ApiError;
        expect(apiErr.statusCode).toBe(503);
      }
    });

    it("should attach context to enhanced errors", async () => {
      mockFetch.mockRejectedValue(new Error("connection failed"));

      try {
        await client.generateText({ model: "gpt-4", prompt: "test" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        const apiErr = err as ApiError;
        expect(apiErr.context).toBeDefined();
        expect(apiErr.context?.service).toBe("ai");
        expect(apiErr.context?.operation).toBe("generate-text");
        expect(apiErr.context?.requestId).toBeDefined();
      }
    });

    it("should reject invalid response shapes via Zod validation", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: "shape" }),
      });

      await expect(
        client.generateText({ model: "gpt-4", prompt: "test" }),
      ).rejects.toThrow();
    });
  });

  // --- AI Operations ---

  describe("AI operations", () => {
    it("generateText should return validated response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            text: "Hello world",
            model: "gpt-4",
            usage: {
              promptTokens: 5,
              completionTokens: 10,
              totalTokens: 15,
            },
          }),
      });

      const result = await client.generateText({
        model: "gpt-4",
        prompt: "Say hello",
      });

      expect(result.text).toBe("Hello world");
      expect(result.model).toBe("gpt-4");
      expect(result.usage.totalTokens).toBe(15);
    });

    it("generateImage should return validated response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            url: "https://images.example.com/img.png",
            prompt: "sunset",
            size: "512x512",
            quality: "standard",
            created: "2024-01-01T00:00:00Z",
          }),
      });

      const result = await client.generateImage({ prompt: "sunset" });

      expect(result.url).toBe("https://images.example.com/img.png");
      expect(result.prompt).toBe("sunset");
      expect(result.size).toBe("512x512");
    });

    it("generateEmbeddings should return validated response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            embedding: [0.1, 0.2, 0.3],
            model: "text-embedding-ada-002",
            usage: { promptTokens: 5, totalTokens: 5 },
          }),
      });

      const result = await client.generateEmbeddings({
        text: "sample text",
      });

      expect(result.embedding).toHaveLength(3);
      expect(result.model).toBe("text-embedding-ada-002");
    });
  });

  // --- Blob Operations ---

  describe("Blob operations", () => {
    it("uploadBlob should POST with correct body", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            bucket: "mybucket",
            key: "file.txt",
            url: "https://storage.example.com/file.txt",
            size: 1024,
            contentType: "text/plain",
            etag: "abc123",
          }),
      });

      const result = await client.uploadBlob({
        bucket: "mybucket",
        key: "file.txt",
        content: "aGVsbG8=",
        contentType: "text/plain",
      });

      expect(result.bucket).toBe("mybucket");
      expect(result.key).toBe("file.txt");
      expect(result.size).toBe(1024);
      expect(mockFetch.mock.calls[0][0]).toContain("/blob/upload");
    });

    it("listBlobs should encode query params", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ objects: [], truncated: false }),
      });

      await client.listBlobs({
        bucket: "my bucket",
        prefix: "docs/",
        maxKeys: 10,
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("bucket=my%20bucket");
      expect(url).toContain("prefix=docs%2F");
      expect(url).toContain("maxKeys=10");
    });

    it("deleteBlob should return success boolean", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await client.deleteBlob("mybucket", "file.txt");
      expect(result.success).toBe(true);
    });
  });

  // --- Functions Operations ---

  describe("Functions operations", () => {
    it("invokeFunction should POST payload", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            functionId: "func_1",
            name: "my-func",
            status: "completed",
            result: { data: "ok" },
            executionTime: 100,
            logs: ["started", "done"],
          }),
      });

      const result = await client.invokeFunction({
        name: "my-func",
        payload: { key: "value" },
      });

      expect(result.status).toBe("completed");
      expect(result.name).toBe("my-func");
      expect(result.logs).toHaveLength(2);
    });

    it("listFunctions should pass status filter", async () => {
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

      const result = await client.listFunctions({ status: "active" });

      expect(result.functions).toHaveLength(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("status=active");
    });
  });

  // --- Graph Operations ---

  describe("Graph operations", () => {
    it("queryGraph should POST query and variables", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              nodes: [
                { id: "n1", type: "User", properties: { name: "Alice" } },
              ],
              edges: [],
            },
            executionTime: 20,
          }),
      });

      const result = await client.queryGraph({
        query: "MATCH (n) RETURN n",
        variables: { limit: 10 },
      });

      expect(result.data.nodes).toHaveLength(1);
      expect(result.executionTime).toBe(20);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toBe("MATCH (n) RETURN n");
      expect(body.variables.limit).toBe(10);
    });

    it("createNode should POST type and properties", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            nodeId: "node_123",
            type: "Person",
            properties: { name: "Bob" },
            created: "2024-01-01",
          }),
      });

      const result = await client.createNode({
        type: "Person",
        properties: { name: "Bob" },
      });

      expect(result.nodeId).toBe("node_123");
      expect(result.type).toBe("Person");
    });
  });

  // --- Pipelines Operations ---

  describe("Pipelines operations", () => {
    it("createPipeline should POST pipeline definition", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            pipelineId: "pipe_1",
            name: "etl",
            description: "ETL pipeline",
            steps: [{ action: "extract" }],
            status: "created",
            created: "2024-01-01",
          }),
      });

      const result = await client.createPipeline({
        name: "etl",
        description: "ETL pipeline",
        steps: [{ action: "extract" }],
      });

      expect(result.pipelineId).toBe("pipe_1");
      expect(result.status).toBe("created");
    });

    it("runPipeline should POST to correct URL with input", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            runId: "run_1",
            pipelineId: "pipe_1",
            status: "running",
            started: "2024-01-01",
            input: { source: "s3" },
          }),
      });

      const result = await client.runPipeline({
        pipelineId: "pipe_1",
        input: { source: "s3" },
      });

      expect(result.runId).toBe("run_1");
      expect(result.status).toBe("running");
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/pipelines/pipe_1/run");
    });
  });
});

describe("ApiError", () => {
  it("should have correct properties", () => {
    const err = new ApiError("test error", 404, "NOT_FOUND", false, {
      service: "ai",
      operation: "test",
    });

    expect(err.message).toBe("test error");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.retryable).toBe(false);
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
    expect(err.context?.service).toBe("ai");
  });

  it("should default statusCode to 500", () => {
    const err = new ApiError("server error");
    expect(err.statusCode).toBe(500);
    expect(err.retryable).toBe(false);
  });
});
