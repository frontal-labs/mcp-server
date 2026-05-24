import { vi } from "vitest";

type JsonObject = Record<string, unknown>;

function getMockConfig(path: string): JsonObject {
  const configs: Record<string, JsonObject> = {
    development: {
      apiKey: "dev-key",
      baseUrl: "https://api.dev.frontal.dev/v1",
      logLevel: "debug",
    },
    test: {
      apiKey: "test-key",
      baseUrl: "https://api.test.frontal.dev/v1",
      logLevel: "error",
    },
    production: {
      apiKey: "prod-key",
      baseUrl: "https://api.frontal.dev/v1",
      logLevel: "warn",
    },
  };

  const env = path.includes("development")
    ? "development"
    : path.includes("test")
      ? "test"
      : "production";

  return configs[env] || configs.test;
}

export async function loadConfig(path: string): Promise<JsonObject> {
  try {
    return getMockConfig(path);
  } catch (error) {
    throw new Error(`Failed to load config from ${path}: ${error}`);
  }
}

export async function loadFixture(name: string): Promise<unknown> {
  const fixtures: Record<string, JsonObject> = {
    "ai-response": {
      text: "Test AI response",
      usage: { tokens: 25 },
    },
    "blob-upload": {
      key: "uploads/test.txt",
      url: "https://storage.example.com/test.txt",
    },
    "function-invoke": {
      statusCode: 200,
      body: '{"result": "success"}',
    },
    "graph-query": {
      results: [],
      totalCount: 0,
    },
    "pipeline-run": {
      executionId: "exec-123",
      status: "running",
    },
  };

  return fixtures[name] || null;
}

export async function loadScenario(name: string): Promise<JsonObject | null> {
  const scenarios: Record<string, JsonObject> = {
    "happy-path": {
      description: "Successful API calls",
      mocks: {
        ai: { success: true },
        blob: { success: true },
        functions: { success: true },
      },
    },
    "error-path": {
      description: "API returns errors",
      mocks: {
        ai: { error: "Invalid API key" },
        blob: { error: "File not found" },
        functions: { error: "Function timeout" },
      },
    },
    "network-error": {
      description: "Network connectivity issues",
      mocks: {
        ai: { networkError: true },
        blob: { networkError: true },
        functions: { networkError: true },
      },
    },
    "rate-limit": {
      description: "API rate limiting",
      mocks: {
        ai: { rateLimit: true },
        blob: { rateLimit: true },
        functions: { rateLimit: true },
      },
    },
  };

  return scenarios[name] || null;
}

async function handleAIMock(
  mock: JsonObject,
  _url: string,
  _options?: RequestInit
) {
  if (mock.success) {
    return new Response(
      JSON.stringify({
        text: "Generated text",
        usage: { tokens: 25 },
      }),
      { status: 200 }
    );
  }

  if (mock.error) {
    return new Response(JSON.stringify({ error: mock.error }), { status: 401 });
  }

  if (mock.networkError) {
    throw new Error("Network error");
  }

  if (mock.rateLimit) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
    });
  }

  return new Response("Internal Server Error", { status: 500 });
}

async function handleBlobMock(
  mock: JsonObject,
  _url: string,
  _options?: RequestInit
) {
  if (mock.success) {
    return new Response(
      JSON.stringify({
        key: "uploads/test.txt",
        url: "https://storage.example.com/test.txt",
      }),
      { status: 200 }
    );
  }

  if (mock.error) {
    return new Response(JSON.stringify({ error: mock.error }), { status: 404 });
  }

  if (mock.networkError) {
    throw new Error("Network error");
  }

  return new Response("Internal Server Error", { status: 500 });
}

async function handleFunctionsMock(
  mock: JsonObject,
  _url: string,
  _options?: RequestInit
) {
  if (mock.success) {
    return new Response(
      JSON.stringify({
        statusCode: 200,
        body: '{"result": "success"}',
      }),
      { status: 200 }
    );
  }

  if (mock.error) {
    return new Response(JSON.stringify({ error: mock.error }), { status: 500 });
  }

  if (mock.networkError) {
    throw new Error("Network error");
  }

  return new Response("Internal Server Error", { status: 500 });
}

export function createMockFetchForScenario(scenario: JsonObject) {
  return vi
    .fn()
    .mockImplementation(async (url: string, options?: RequestInit) => {
      const mocks = scenario.mocks as JsonObject | undefined;
      if (mocks) {
        if (url.includes("/ai/") && mocks.ai) {
          return handleAIMock(mocks.ai as JsonObject, url, options);
        }
        if (url.includes("/blob/") && mocks.blob) {
          return handleBlobMock(mocks.blob as JsonObject, url, options);
        }
        if (url.includes("/functions/") && mocks.functions) {
          return handleFunctionsMock(
            mocks.functions as JsonObject,
            url,
            options
          );
        }
      }

      return new Response("Not Found", { status: 404 });
    });
}
