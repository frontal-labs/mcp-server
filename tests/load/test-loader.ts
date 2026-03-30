import { vi } from "vitest";

// Test data loading utilities

export class TestLoader {
  // Load test configuration from JSON files
  static async loadConfig(path: string): Promise<any> {
    try {
      // In a real implementation, this would load from file system
      // For tests, we return mock data
      return TestLoader.getMockConfig(path);
    } catch (error) {
      throw new Error(`Failed to load config from ${path}: ${error}`);
    }
  }

  // Load test fixtures
  static async loadFixture(name: string): Promise<any> {
    const fixtures: Record<string, any> = {
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

  // Load test scenarios
  static async loadScenario(name: string): Promise<any> {
    const scenarios: Record<string, any> = {
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

  // Get mock configuration
  private static getMockConfig(path: string): any {
    const configs: Record<string, any> = {
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

    // Extract environment from path
    const env = path.includes("development")
      ? "development"
      : path.includes("test")
        ? "test"
        : "production";

    return configs[env] || configs.test;
  }

  // Create mock fetch with scenario
  static createMockFetchForScenario(scenario: any) {
    return vi
      .fn()
      .mockImplementation(async (url: string, options?: RequestInit) => {
        // Simulate different scenarios based on scenario data
        if (scenario.mocks) {
          if (url.includes("/ai/") && scenario.mocks.ai) {
            return TestLoader.handleAIMock(scenario.mocks.ai, url, options);
          }
          if (url.includes("/blob/") && scenario.mocks.blob) {
            return TestLoader.handleBlobMock(scenario.mocks.blob, url, options);
          }
          if (url.includes("/functions/") && scenario.mocks.functions) {
            return TestLoader.handleFunctionsMock(
              scenario.mocks.functions,
              url,
              options
            );
          }
        }

        return new Response("Not Found", { status: 404 });
      });
  }

  // Handle AI service mocks
  private static async handleAIMock(
    mock: any,
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
      return new Response(
        JSON.stringify({
          error: mock.error,
        }),
        { status: 401 }
      );
    }

    if (mock.networkError) {
      throw new Error("Network error");
    }

    if (mock.rateLimit) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
        }),
        { status: 429 }
      );
    }

    return new Response("Internal Server Error", { status: 500 });
  }

  // Handle Blob service mocks
  private static async handleBlobMock(
    mock: any,
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
      return new Response(
        JSON.stringify({
          error: mock.error,
        }),
        { status: 404 }
      );
    }

    if (mock.networkError) {
      throw new Error("Network error");
    }

    return new Response("Internal Server Error", { status: 500 });
  }

  // Handle Functions service mocks
  private static async handleFunctionsMock(
    mock: any,
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
      return new Response(
        JSON.stringify({
          error: mock.error,
        }),
        { status: 500 }
      );
    }

    if (mock.networkError) {
      throw new Error("Network error");
    }

    return new Response("Internal Server Error", { status: 500 });
  }
}

// Export convenience functions
export const loadTestConfig = (env = "test") =>
  TestLoader.loadConfig(`config/${env}.json`);
export const loadTestFixture = (name: string) => TestLoader.loadFixture(name);
export const loadTestScenario = (name: string) => TestLoader.loadScenario(name);
export const createScenarioMock = (scenario: string) => {
  return TestLoader.loadScenario(scenario).then((scenario) =>
    TestLoader.createMockFetchForScenario(scenario)
  );
};
