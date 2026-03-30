// Mock API responses for testing

export const mockAIResponses = {
  generateText: {
    success: {
      text: "This is a generated response from the AI model.",
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
      },
      model: "gpt-3.5-turbo",
    },
    error: {
      error: "Invalid API key",
      type: "authentication_error",
    },
  },

  generateImage: {
    success: {
      image_url:
        "https://oaidalleapiprodscus.blob.core.windows.net/test-image.png",
      revised_prompt: "A beautiful landscape with mountains",
      usage: {
        prompt_tokens: 20,
        total_tokens: 20,
      },
    },
    error: {
      error: "Invalid prompt",
      type: "invalid_request_error",
    },
  },

  generateEmbeddings: {
    success: {
      data: [
        {
          object: "embedding",
          embedding: [0.002, -0.003, 0.045, -0.023, 0.016],
        },
      ],
      usage: {
        prompt_tokens: 8,
        total_tokens: 8,
      },
    },
  },
};

export const mockBlobResponses = {
  upload: {
    success: {
      key: "uploads/test-file.txt",
      url: "https://storage.example.com/test-file.txt",
      size: 1024,
      etag: '"abc123"',
      lastModified: "2024-01-01T00:00:00Z",
    },
    error: {
      error: "File too large",
      type: "file_size_error",
    },
  },

  list: {
    success: {
      objects: [
        {
          key: "documents/report.pdf",
          size: 2048,
          lastModified: "2024-01-01T12:00:00Z",
          etag: '"def456"',
        },
        {
          key: "images/photo.jpg",
          size: 1024,
          lastModified: "2024-01-02T15:30:00Z",
          etag: '"ghi789"',
        },
      ],
      totalCount: 2,
      isTruncated: false,
    },
  },

  delete: {
    success: {
      success: true,
      deleted: ["uploads/test-file.txt"],
    },
  },
};

export const mockFunctionResponses = {
  invoke: {
    success: {
      statusCode: 200,
      body: JSON.stringify({ message: "Function executed successfully" }),
      logs: "START RequestId: test-123\nEND RequestId: test-123",
      executionTime: 150,
    },
    error: {
      error: "Function timeout",
      type: "timeout_error",
    },
  },

  list: {
    success: {
      functions: [
        {
          name: "my-function",
          runtime: "nodejs18",
          handler: "index.handler",
          memory: 256,
          timeout: 30,
          lastModified: "2024-01-01T00:00:00Z",
        },
      ],
    },
  },
};

export const mockGraphResponses = {
  query: {
    success: {
      results: [
        {
          id: "node-1",
          labels: ["Person"],
          properties: {
            name: "John Doe",
            age: 30,
          },
        },
      ],
      totalCount: 1,
    },
  },

  createNode: {
    success: {
      id: "node-123",
      labels: ["Person"],
      properties: {
        name: "Jane Smith",
        age: 25,
      },
    },
  },
};

export const mockPipelineResponses = {
  create: {
    success: {
      id: "pipeline-123",
      name: "data-processing-pipeline",
      status: "created",
      createdAt: "2024-01-01T00:00:00Z",
    },
  },

  run: {
    success: {
      executionId: "exec-456",
      pipelineId: "pipeline-123",
      status: "running",
      startedAt: "2024-01-01T12:00:00Z",
    },
  },
};
