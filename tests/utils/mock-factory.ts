import { vi } from "vitest";

// Mock factory for creating consistent test doubles

export class MockFactory {
  static createFetchResponse(data: unknown, ok = true, status = 200) {
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

  static createFetchError(message: string, status = 500) {
    return {
      ok: false,
      status,
      json: vi.fn().mockResolvedValue({ error: message }),
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: message })),
      headers: new Map([["content-type", "application/json"]]),
    };
  }

  static createNetworkError(message = "Network error") {
    const error = new Error(message);
    return vi.fn().mockRejectedValue(error);
  }

  static createTimeoutError(message = "Request timeout") {
    const error = new Error(message);
    error.name = "TimeoutError";
    return vi.fn().mockRejectedValue(error);
  }

  static createAuthError(message = "Authentication failed") {
    const error = new Error(message);
    error.name = "AuthenticationError";
    return vi.fn().mockRejectedValue(error);
  }

  static createValidationError(message = "Invalid input") {
    const error = new Error(message);
    error.name = "ValidationError";
    return vi.fn().mockRejectedValue(error);
  }

  static createFileUploadResponse(fileData: { name: string; size: number }) {
    return MockFactory.createFetchResponse({
      key: `uploads/${fileData.name}`,
      url: `https://storage.example.com/${fileData.name}`,
      size: fileData.size,
      etag: `"${Math.random().toString(36).substring(7)}"`,
      lastModified: new Date().toISOString(),
    });
  }

  static createListObjectsResponse(objects: unknown[], totalCount?: number) {
    return MockFactory.createFetchResponse({
      objects,
      totalCount: totalCount || objects.length,
      isTruncated: false,
    });
  }

  static createAIResponse(text: string, usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) {
    return MockFactory.createFetchResponse({
      text,
      usage: usage || {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
      },
      model: "gpt-3.5-turbo",
    });
  }

  static createImageResponse(imageUrl: string, revisedPrompt?: string) {
    return MockFactory.createFetchResponse({
      image_url: imageUrl,
      revised_prompt: revisedPrompt || "Generated image",
      usage: {
        prompt_tokens: 20,
        total_tokens: 20,
      },
    });
  }

  static createEmbeddingsResponse(embeddings: number[][]) {
    return MockFactory.createFetchResponse({
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

  static createFunctionResponse(result: unknown, logs?: string) {
    return MockFactory.createFetchResponse({
      statusCode: 200,
      body: JSON.stringify(result),
      logs: logs || "Function executed successfully",
      executionTime: 150,
    });
  }

  static createGraphResponse(nodes: unknown[], totalCount?: number) {
    return MockFactory.createFetchResponse({
      results: nodes,
      totalCount: totalCount || nodes.length,
    });
  }

  static createPipelineResponse(pipelineData: Record<string, unknown>) {
    return MockFactory.createFetchResponse({
      id: `pipeline-${Math.random().toString(36).substring(7)}`,
      status: "created",
      createdAt: new Date().toISOString(),
      ...pipelineData,
    });
  }
}

// Helper to mock global fetch
export const mockGlobalFetch = (response: unknown) => {
  global.fetch = vi.fn().mockResolvedValue(response) as typeof fetch;
};

// Helper to restore original fetch
export const restoreFetch = () => {
  if (typeof global.fetch !== "undefined" && vi.isMockFunction(global.fetch)) {
    (global.fetch as vi.MockedFunction<typeof fetch>).mockRestore();
  }
};
