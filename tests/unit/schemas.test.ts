import { describe, expect, it } from "vitest";
import {
  aiGenerateTextSchema,
  aiGenerateImageSchema,
  aiEmbedSchema,
  blobUploadSchema,
  blobListSchema,
  functionsInvokeSchema,
  functionsListSchema,
  graphQuerySchema,
  graphCreateNodeSchema,
  pipelinesCreateSchema,
  pipelinesRunSchema,
  generateTextResponseSchema,
  generateImageResponseSchema,
  generateEmbeddingsResponseSchema,
  uploadResponseSchema,
  listBlobResponseSchema,
  invokeResponseSchema,
  listFunctionsResponseSchema,
  graphQueryResponseSchema,
  createNodeResponseSchema,
  createPipelineResponseSchema,
  runPipelineResponseSchema,
} from "@/models/index.js";

// --- Input Schemas ---

describe("AI input schemas", () => {
  it("aiGenerateTextSchema accepts valid input", () => {
    const result = aiGenerateTextSchema.safeParse({
      model: "gpt-4",
      prompt: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("aiGenerateTextSchema accepts optional fields", () => {
    const result = aiGenerateTextSchema.safeParse({
      model: "gpt-4",
      prompt: "Hello",
      maxTokens: 100,
      temperature: 0.7,
    });
    expect(result.success).toBe(true);
  });

  it("aiGenerateTextSchema rejects missing model", () => {
    const result = aiGenerateTextSchema.safeParse({ prompt: "Hello" });
    expect(result.success).toBe(false);
  });

  it("aiGenerateTextSchema rejects missing prompt", () => {
    const result = aiGenerateTextSchema.safeParse({ model: "gpt-4" });
    expect(result.success).toBe(false);
  });

  it("aiGenerateImageSchema accepts valid input", () => {
    const result = aiGenerateImageSchema.safeParse({ prompt: "sunset" });
    expect(result.success).toBe(true);
  });

  it("aiGenerateImageSchema accepts size and quality", () => {
    const result = aiGenerateImageSchema.safeParse({
      prompt: "sunset",
      size: "512x512",
      quality: "hd",
    });
    expect(result.success).toBe(true);
  });

  it("aiGenerateImageSchema rejects invalid size", () => {
    const result = aiGenerateImageSchema.safeParse({
      prompt: "sunset",
      size: "800x600",
    });
    expect(result.success).toBe(false);
  });

  it("aiEmbedSchema accepts valid input", () => {
    const result = aiEmbedSchema.safeParse({ text: "sample" });
    expect(result.success).toBe(true);
  });

  it("aiEmbedSchema accepts optional model", () => {
    const result = aiEmbedSchema.safeParse({
      text: "sample",
      model: "ada-002",
    });
    expect(result.success).toBe(true);
  });

  it("aiEmbedSchema rejects missing text", () => {
    const result = aiEmbedSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("Blob input schemas", () => {
  it("blobUploadSchema accepts valid input", () => {
    const result = blobUploadSchema.safeParse({
      bucket: "mybucket",
      key: "file.txt",
      content: "aGVsbG8=",
    });
    expect(result.success).toBe(true);
  });

  it("blobUploadSchema accepts optional contentType", () => {
    const result = blobUploadSchema.safeParse({
      bucket: "mybucket",
      key: "file.txt",
      content: "aGVsbG8=",
      contentType: "text/plain",
    });
    expect(result.success).toBe(true);
  });

  it("blobUploadSchema rejects missing bucket", () => {
    const result = blobUploadSchema.safeParse({
      key: "file.txt",
      content: "aGVsbG8=",
    });
    expect(result.success).toBe(false);
  });

  it("blobListSchema accepts valid input", () => {
    const result = blobListSchema.safeParse({ bucket: "mybucket" });
    expect(result.success).toBe(true);
  });

  it("blobListSchema accepts optional fields", () => {
    const result = blobListSchema.safeParse({
      bucket: "mybucket",
      prefix: "docs/",
      maxKeys: 50,
    });
    expect(result.success).toBe(true);
  });
});

describe("Functions input schemas", () => {
  it("functionsInvokeSchema accepts valid input", () => {
    const result = functionsInvokeSchema.safeParse({
      name: "my-func",
      payload: { key: "value" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invokeAsync).toBe(false); // default
    }
  });

  it("functionsInvokeSchema accepts invokeAsync", () => {
    const result = functionsInvokeSchema.safeParse({
      name: "my-func",
      payload: {},
      invokeAsync: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invokeAsync).toBe(true);
    }
  });

  it("functionsInvokeSchema rejects missing name", () => {
    const result = functionsInvokeSchema.safeParse({ payload: {} });
    expect(result.success).toBe(false);
  });

  it("functionsListSchema defaults to 'all'", () => {
    const result = functionsListSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("all");
    }
  });

  it("functionsListSchema accepts valid status", () => {
    const result = functionsListSchema.safeParse({ status: "active" });
    expect(result.success).toBe(true);
  });

  it("functionsListSchema rejects invalid status", () => {
    const result = functionsListSchema.safeParse({ status: "deleted" });
    expect(result.success).toBe(false);
  });
});

describe("Graph input schemas", () => {
  it("graphQuerySchema accepts valid input", () => {
    const result = graphQuerySchema.safeParse({ query: "MATCH (n) RETURN n" });
    expect(result.success).toBe(true);
  });

  it("graphQuerySchema accepts optional variables", () => {
    const result = graphQuerySchema.safeParse({
      query: "MATCH (n) WHERE n.age > $age",
      variables: { age: 18 },
    });
    expect(result.success).toBe(true);
  });

  it("graphCreateNodeSchema accepts valid input", () => {
    const result = graphCreateNodeSchema.safeParse({
      type: "Person",
      properties: { name: "Alice" },
    });
    expect(result.success).toBe(true);
  });

  it("graphCreateNodeSchema rejects missing type", () => {
    const result = graphCreateNodeSchema.safeParse({
      properties: { name: "Alice" },
    });
    expect(result.success).toBe(false);
  });

  it("graphCreateNodeSchema rejects missing properties", () => {
    const result = graphCreateNodeSchema.safeParse({ type: "Person" });
    expect(result.success).toBe(false);
  });
});

describe("Pipelines input schemas", () => {
  it("pipelinesCreateSchema accepts valid input", () => {
    const result = pipelinesCreateSchema.safeParse({
      name: "etl",
      description: "ETL pipeline",
      steps: [{ action: "extract" }],
    });
    expect(result.success).toBe(true);
  });

  it("pipelinesCreateSchema rejects missing steps", () => {
    const result = pipelinesCreateSchema.safeParse({
      name: "etl",
      description: "ETL pipeline",
    });
    expect(result.success).toBe(false);
  });

  it("pipelinesRunSchema accepts valid input", () => {
    const result = pipelinesRunSchema.safeParse({ pipelineId: "pipe_1" });
    expect(result.success).toBe(true);
  });

  it("pipelinesRunSchema accepts optional input", () => {
    const result = pipelinesRunSchema.safeParse({
      pipelineId: "pipe_1",
      input: { source: "s3" },
    });
    expect(result.success).toBe(true);
  });

  it("pipelinesRunSchema rejects missing pipelineId", () => {
    const result = pipelinesRunSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// --- Response Schemas ---

describe("AI response schemas", () => {
  it("generateTextResponseSchema validates correct response", () => {
    const result = generateTextResponseSchema.safeParse({
      text: "Hello",
      model: "gpt-4",
      usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
    });
    expect(result.success).toBe(true);
  });

  it("generateTextResponseSchema rejects missing usage", () => {
    const result = generateTextResponseSchema.safeParse({
      text: "Hello",
      model: "gpt-4",
    });
    expect(result.success).toBe(false);
  });

  it("generateTextResponseSchema rejects incomplete usage", () => {
    const result = generateTextResponseSchema.safeParse({
      text: "Hello",
      model: "gpt-4",
      usage: { promptTokens: 5 },
    });
    expect(result.success).toBe(false);
  });

  it("generateImageResponseSchema validates correct response", () => {
    const result = generateImageResponseSchema.safeParse({
      url: "https://example.com/img.png",
      prompt: "sunset",
      size: "512x512",
      quality: "standard",
      created: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("generateImageResponseSchema rejects invalid url", () => {
    const result = generateImageResponseSchema.safeParse({
      url: "not-a-url",
      prompt: "sunset",
      size: "512x512",
      quality: "standard",
      created: "2024-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("generateEmbeddingsResponseSchema validates correct response", () => {
    const result = generateEmbeddingsResponseSchema.safeParse({
      embedding: [0.1, 0.2, 0.3],
      model: "ada-002",
      usage: { promptTokens: 5, totalTokens: 5 },
    });
    expect(result.success).toBe(true);
  });

  it("generateEmbeddingsResponseSchema rejects non-number embedding", () => {
    const result = generateEmbeddingsResponseSchema.safeParse({
      embedding: ["a", "b"],
      model: "ada-002",
      usage: { promptTokens: 5, totalTokens: 5 },
    });
    expect(result.success).toBe(false);
  });
});

describe("Blob response schemas", () => {
  it("uploadResponseSchema validates correct response", () => {
    const result = uploadResponseSchema.safeParse({
      bucket: "mybucket",
      key: "file.txt",
      url: "https://storage.example.com/file.txt",
      size: 1024,
      contentType: "text/plain",
      etag: "abc123",
    });
    expect(result.success).toBe(true);
  });

  it("uploadResponseSchema rejects missing fields", () => {
    const result = uploadResponseSchema.safeParse({
      bucket: "mybucket",
      key: "file.txt",
    });
    expect(result.success).toBe(false);
  });

  it("listBlobResponseSchema validates correct response", () => {
    const result = listBlobResponseSchema.safeParse({
      objects: [
        { key: "file.txt", size: 100, lastModified: "2024-01-01", etag: "abc" },
      ],
      truncated: false,
    });
    expect(result.success).toBe(true);
  });

  it("listBlobResponseSchema validates empty objects list", () => {
    const result = listBlobResponseSchema.safeParse({
      objects: [],
      truncated: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("Functions response schemas", () => {
  it("invokeResponseSchema validates completed response", () => {
    const result = invokeResponseSchema.safeParse({
      functionId: "func_1",
      name: "my-func",
      status: "completed",
      result: { data: "ok" },
      executionTime: 100,
      logs: ["started", "done"],
    });
    expect(result.success).toBe(true);
  });

  it("invokeResponseSchema validates pending response with null result", () => {
    const result = invokeResponseSchema.safeParse({
      functionId: "func_1",
      name: "my-func",
      status: "pending",
      result: null,
      logs: [],
    });
    expect(result.success).toBe(true);
  });

  it("invokeResponseSchema rejects invalid status", () => {
    const result = invokeResponseSchema.safeParse({
      functionId: "func_1",
      name: "my-func",
      status: "failed",
      result: null,
      logs: [],
    });
    expect(result.success).toBe(false);
  });

  it("listFunctionsResponseSchema validates correct response", () => {
    const result = listFunctionsResponseSchema.safeParse({
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
    });
    expect(result.success).toBe(true);
  });

  it("listFunctionsResponseSchema validates empty list", () => {
    const result = listFunctionsResponseSchema.safeParse({ functions: [] });
    expect(result.success).toBe(true);
  });
});

describe("Graph response schemas", () => {
  it("graphQueryResponseSchema validates correct response", () => {
    const result = graphQueryResponseSchema.safeParse({
      data: {
        nodes: [{ id: "n1", type: "User", properties: { name: "Alice" } }],
        edges: [{ from: "n1", to: "n2", type: "KNOWS" }],
      },
      executionTime: 30,
    });
    expect(result.success).toBe(true);
  });

  it("graphQueryResponseSchema validates empty nodes and edges", () => {
    const result = graphQueryResponseSchema.safeParse({
      data: { nodes: [], edges: [] },
      executionTime: 0,
    });
    expect(result.success).toBe(true);
  });

  it("graphQueryResponseSchema rejects missing executionTime", () => {
    const result = graphQueryResponseSchema.safeParse({
      data: { nodes: [], edges: [] },
    });
    expect(result.success).toBe(false);
  });

  it("createNodeResponseSchema validates correct response", () => {
    const result = createNodeResponseSchema.safeParse({
      nodeId: "node_abc",
      type: "Document",
      properties: { title: "Report" },
      created: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("createNodeResponseSchema rejects missing nodeId", () => {
    const result = createNodeResponseSchema.safeParse({
      type: "Document",
      properties: {},
      created: "2024-01-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("Pipelines response schemas", () => {
  it("createPipelineResponseSchema validates correct response", () => {
    const result = createPipelineResponseSchema.safeParse({
      pipelineId: "pipe_1",
      name: "etl",
      description: "ETL pipeline",
      steps: [{ action: "extract" }],
      status: "created",
      created: "2024-01-01",
    });
    expect(result.success).toBe(true);
  });

  it("createPipelineResponseSchema rejects missing pipelineId", () => {
    const result = createPipelineResponseSchema.safeParse({
      name: "etl",
      description: "ETL",
      steps: [],
      status: "created",
      created: "2024-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("runPipelineResponseSchema validates correct response", () => {
    const result = runPipelineResponseSchema.safeParse({
      runId: "run_1",
      pipelineId: "pipe_1",
      status: "running",
      started: "2024-01-01T12:00:00Z",
      input: { source: "s3" },
    });
    expect(result.success).toBe(true);
  });

  it("runPipelineResponseSchema rejects missing runId", () => {
    const result = runPipelineResponseSchema.safeParse({
      pipelineId: "pipe_1",
      status: "running",
      started: "2024-01-01",
      input: {},
    });
    expect(result.success).toBe(false);
  });
});
