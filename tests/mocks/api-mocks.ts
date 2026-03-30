import { vi } from "vitest";

// API mock implementations for testing

export const mockFrontalAPI = {
  // AI Service mocks
  ai: {
    generateText: vi.fn(),
    generateImage: vi.fn(),
    generateEmbeddings: vi.fn(),
  },

  // Blob Service mocks
  blob: {
    uploadFile: vi.fn(),
    listObjects: vi.fn(),
    deleteObject: vi.fn(),
    getSignedUrl: vi.fn(),
  },

  // Functions Service mocks
  functions: {
    invoke: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },

  // Graph Service mocks
  graph: {
    query: vi.fn(),
    createNode: vi.fn(),
    createRelationship: vi.fn(),
    updateNode: vi.fn(),
    deleteNode: vi.fn(),
  },

  // Pipelines Service mocks
  pipelines: {
    create: vi.fn(),
    run: vi.fn(),
    getStatus: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  },
};

// Helper to reset all mocks
export const resetAllMocks = () => {
  Object.values(mockFrontalAPI).forEach((service) => {
    Object.values(service).forEach((mock) => {
      if (mock && typeof mock.mockReset === "function") {
        mock.mockReset();
      }
    });
  });
};

// Helper to setup mock responses
export const setupMockResponses = (responses: any) => {
  Object.entries(responses).forEach(([service, methods]) => {
    if (mockFrontalAPI[service as keyof typeof mockFrontalAPI]) {
      Object.entries(methods).forEach(([method, response]) => {
        const mock = (
          mockFrontalAPI[service as keyof typeof mockFrontalAPI] as any
        )[method];
        if (mock && typeof mock.mockResolvedValue === "function") {
          mock.mockResolvedValue(response);
        }
      });
    }
  });
};

// Mock for fetch with different responses
export const createMockFetch = () => {
  return vi
    .fn()
    .mockImplementation(async (url: string, options?: RequestInit) => {
      // Parse URL to determine which service is being called
      if (url.includes("/ai/")) {
        return handleAIMock(url, options);
      } else if (url.includes("/blob/")) {
        return handleBlobMock(url, options);
      } else if (url.includes("/functions/")) {
        return handleFunctionsMock(url, options);
      } else if (url.includes("/graph/")) {
        return handleGraphMock(url, options);
      } else if (url.includes("/pipelines/")) {
        return handlePipelinesMock(url, options);
      }

      // Default response
      return new Response("Not Found", { status: 404 });
    });
};

// Service-specific handlers
const handleAIMock = async (url: string, options?: RequestInit) => {
  if (url.includes("/generate-text")) {
    const body = options?.body ? JSON.parse(options.body as string) : {};
    return new Response(
      JSON.stringify({
        text: `Generated response for: ${body.prompt}`,
        usage: { tokens: 25 },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response("AI endpoint not found", { status: 404 });
};

const handleBlobMock = async (url: string, _options?: RequestInit) => {
  if (url.includes("/upload")) {
    return new Response(
      JSON.stringify({
        key: "uploads/test-file.txt",
        url: "https://storage.example.com/test-file.txt",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response("Blob endpoint not found", { status: 404 });
};

const handleFunctionsMock = async (url: string, _options?: RequestInit) => {
  if (url.includes("/invoke")) {
    return new Response(
      JSON.stringify({
        statusCode: 200,
        body: '{"message": "Function executed"}',
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response("Functions endpoint not found", { status: 404 });
};

const handleGraphMock = async (url: string, _options?: RequestInit) => {
  if (url.includes("/query")) {
    return new Response(
      JSON.stringify({
        results: [],
        totalCount: 0,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response("Graph endpoint not found", { status: 404 });
};

const handlePipelinesMock = async (url: string, _options?: RequestInit) => {
  if (url.includes("/run")) {
    return new Response(
      JSON.stringify({
        executionId: "exec-123",
        status: "running",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response("Pipelines endpoint not found", { status: 404 });
};
