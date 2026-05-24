import { vi } from "vitest";

type JsonObject = Record<string, unknown>;

export const mustGet = <T>(map: Map<string, T>, key: string): T => {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing expected key: ${key}`);
  return value;
};

export function createFetchResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    headers: new Map([
      ["content-type", "application/json"],
      ["x-request-id", "test-request-id"],
    ]),
  };
}

export function createFetchError(message: string, status = 500) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({ error: message }),
    text: vi.fn().mockResolvedValue(JSON.stringify({ error: message })),
    headers: new Map([["content-type", "application/json"]]),
  };
}

export function createNetworkError(message = "Network error") {
  const error = new Error(message);
  return vi.fn().mockRejectedValue(error);
}

export function createTimeoutError(message = "Request timeout") {
  const error = new Error(message);
  error.name = "TimeoutError";
  return vi.fn().mockRejectedValue(error);
}

export function createAuthError(message = "Authentication failed") {
  const error = new Error(message);
  error.name = "AuthenticationError";
  return vi.fn().mockRejectedValue(error);
}

export function createValidationError(message = "Invalid input") {
  const error = new Error(message);
  error.name = "ValidationError";
  return vi.fn().mockRejectedValue(error);
}

export function createFileUploadResponse(fileData: {
  name: string;
  size: number;
}) {
  return createFetchResponse({
    key: `uploads/${fileData.name}`,
    url: `https://storage.example.com/${fileData.name}`,
    size: fileData.size,
    etag: `"${Math.random().toString(36).substring(7)}"`,
    lastModified: new Date().toISOString(),
  });
}

export function createListObjectsResponse(
  objects: unknown[],
  totalCount?: number
) {
  return createFetchResponse({
    objects,
    totalCount: totalCount || objects.length,
    isTruncated: false,
  });
}

export function createAIResponse(
  text: string,
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }
) {
  return createFetchResponse({
    text,
    usage: usage || {
      prompt_tokens: 10,
      completion_tokens: 15,
      total_tokens: 25,
    },
    model: "gpt-3.5-turbo",
  });
}

export function createImageResponse(imageUrl: string, revisedPrompt?: string) {
  return createFetchResponse({
    image_url: imageUrl,
    revised_prompt: revisedPrompt || "Generated image",
    usage: {
      prompt_tokens: 20,
      total_tokens: 20,
    },
  });
}

export function createEmbeddingsResponse(embeddings: number[][]) {
  return createFetchResponse({
    data: embeddings.map((embedding, index) => ({
      object: "embedding",
      embedding,
      index,
    })),
    usage: {
      prompt_tokens: 8,
      total_tokens: 8,
    },
  });
}

export function createFunctionResponse(result: unknown, logs?: string) {
  return createFetchResponse({
    statusCode: 200,
    body: JSON.stringify(result),
    logs: logs || "Function executed successfully",
    executionTime: 150,
  });
}

export function createGraphResponse(nodes: JsonObject[], totalCount?: number) {
  return createFetchResponse({
    results: nodes,
    totalCount: totalCount || nodes.length,
  });
}

export function createPipelineResponse(pipelineData: JsonObject) {
  return createFetchResponse({
    id: `pipeline-${Math.random().toString(36).substring(7)}`,
    status: "created",
    createdAt: new Date().toISOString(),
    ...pipelineData,
  });
}

export const mockGlobalFetch = (response: unknown) => {
  global.fetch = vi.fn().mockResolvedValue(response) as typeof fetch;
};

export const restoreFetch = () => {
  if (typeof global.fetch !== "undefined" && vi.isMockFunction(global.fetch)) {
    (global.fetch as ReturnType<typeof vi.fn>).mockRestore();
  }
};
