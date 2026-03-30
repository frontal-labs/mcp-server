import { z } from "zod";

export const aiGenerateTextSchema = z.object({
  model: z.string().describe("AI model to use"),
  prompt: z.string().describe("Text prompt for generation"),
  maxTokens: z.number().optional().describe("Maximum tokens to generate"),
  temperature: z.number().optional().describe("Generation temperature"),
});

export const aiGenerateImageSchema = z.object({
  prompt: z.string().describe("Image prompt"),
  size: z
    .enum(["256x256", "512x512", "1024x1024"])
    .optional()
    .describe("Image size"),
  quality: z.enum(["standard", "hd"]).optional().describe("Image quality"),
});

export const aiEmbedSchema = z.object({
  text: z.string().describe("Text to embed"),
  model: z.string().optional().describe("Embedding model"),
});

export const blobUploadSchema = z.object({
  bucket: z.string().describe("Bucket name"),
  key: z.string().describe("Object key"),
  content: z.string().describe("Base64 encoded content"),
  contentType: z.string().optional().describe("Content type"),
});

export const blobListSchema = z.object({
  bucket: z.string().describe("Bucket name"),
  prefix: z.string().optional().describe("Object prefix"),
  maxKeys: z.number().optional().describe("Maximum keys to return"),
});

export const functionsInvokeSchema = z.object({
  name: z.string().describe("Function name"),
  payload: z.record(z.string(), z.unknown()).describe("Function payload"),
  invokeAsync: z.boolean().default(false).describe("Invoke asynchronously"),
});

export const functionsListSchema = z.object({
  status: z
    .enum(["active", "inactive", "all"])
    .default("all")
    .describe("Filter by status"),
});

export const graphQuerySchema = z.object({
  query: z.string().describe("Graph query"),
  variables: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Query variables"),
});

export const graphCreateNodeSchema = z.object({
  type: z.string().describe("Node type"),
  properties: z.record(z.string(), z.unknown()).describe("Node properties"),
});

export const pipelinesCreateSchema = z.object({
  name: z.string().describe("Pipeline name"),
  description: z.string().describe("Pipeline description"),
  steps: z.array(z.record(z.string(), z.unknown())).describe("Pipeline steps"),
});

export const pipelinesRunSchema = z.object({
  pipelineId: z.string().describe("Pipeline ID"),
  input: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Pipeline input"),
});
