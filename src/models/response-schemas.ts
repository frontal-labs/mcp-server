import { z } from "zod";

export const generateTextResponseSchema = z.object({
  text: z.string(),
  model: z.string(),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }),
});

export const generateImageResponseSchema = z.object({
  url: z.string().url(),
  prompt: z.string(),
  size: z.string(),
  quality: z.string(),
  created: z.string(),
});

export const generateEmbeddingsResponseSchema = z.object({
  embedding: z.array(z.number()),
  model: z.string(),
  usage: z.object({
    promptTokens: z.number(),
    totalTokens: z.number(),
  }),
});

export const uploadResponseSchema = z.object({
  bucket: z.string(),
  key: z.string(),
  url: z.string(),
  size: z.number(),
  contentType: z.string(),
  etag: z.string(),
});

export const listBlobResponseSchema = z.object({
  objects: z.array(
    z.object({
      key: z.string(),
      size: z.number(),
      lastModified: z.string(),
      etag: z.string(),
    })
  ),
  truncated: z.boolean(),
});

export const deleteBlobResponseSchema = z.object({
  success: z.boolean(),
});

export const invokeResponseSchema = z.object({
  functionId: z.string(),
  name: z.string(),
  status: z.enum(["pending", "completed"]),
  result: z.unknown(),
  executionTime: z.number().optional(),
  logs: z.array(z.string()),
});

export const listFunctionsResponseSchema = z.object({
  functions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
      runtime: z.string(),
      memory: z.number(),
      timeout: z.number(),
      created: z.string(),
    })
  ),
});

export const graphQueryResponseSchema = z.object({
  data: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        properties: z.record(z.string(), z.unknown()),
      })
    ),
    edges: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.string(),
      })
    ),
  }),
  executionTime: z.number(),
});

export const createNodeResponseSchema = z.object({
  nodeId: z.string(),
  type: z.string(),
  properties: z.record(z.string(), z.unknown()),
  created: z.string(),
});

export const createPipelineResponseSchema = z.object({
  pipelineId: z.string(),
  name: z.string(),
  description: z.string(),
  steps: z.array(z.record(z.string(), z.unknown())),
  status: z.string(),
  created: z.string(),
});

export const runPipelineResponseSchema = z.object({
  runId: z.string(),
  pipelineId: z.string(),
  status: z.string(),
  started: z.string(),
  input: z.record(z.string(), z.unknown()),
});
