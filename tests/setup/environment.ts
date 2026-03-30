import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

// Environment setup for tests

interface TestEnvironment {
  originalEnv: Record<string, string | undefined>;
  mockFetch: typeof globalThis.fetch | null;
}

const testEnv: TestEnvironment = {
  originalEnv: {},
  mockFetch: null,
};

// Global setup before all tests
beforeAll(() => {
  // Store original environment
  testEnv.originalEnv = { ...process.env };

  // Set test environment variables
  process.env.NODE_ENV = "test";
  process.env.FRONTAL_API_KEY = "test-api-key-12345";
  process.env.FRONTAL_BASE_URL = "https://api.test.frontal.dev/v1";
  process.env.FRONTAL_LOG_LEVEL = "error";

  // Suppress console output unless explicitly enabled
  if (process.env.VERBOSE_TESTS !== "true") {
    global.console = {
      ...console,
      log: () => {},
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: console.error, // Keep errors for debugging
    };
  }
});

// Global cleanup after all tests
afterAll(() => {
  // Restore original environment
  Object.keys(process.env).forEach((key) => {
    delete process.env[key];
  });
  Object.assign(process.env, testEnv.originalEnv);

  // Restore console
  global.console = console;

  // Clean up mocks
  if (testEnv.mockFetch && typeof global.fetch !== "undefined") {
    global.fetch = testEnv.mockFetch;
  }
});

// Setup before each test
beforeEach(() => {
  // Reset any module mocks
  vi.clearAllMocks();

  // Store original fetch if not already stored
  if (!testEnv.mockFetch && typeof global.fetch !== "undefined") {
    testEnv.mockFetch = global.fetch;
  }
});

// Cleanup after each test
afterEach(() => {
  // Clear any timers
  vi.clearAllTimers();

  // Restore fetch to original or mocked version
  if (testEnv.mockFetch) {
    global.fetch = testEnv.mockFetch;
  }
});

// Export utilities for test files
export const getTestEnv = () => testEnv;

export const setTestEnvVar = (key: string, value: string) => {
  process.env[key] = value;
};

export const removeTestEnvVar = (key: string) => {
  delete process.env[key];
};

export const withTestEnv = <T>(
  vars: Record<string, string>,
  callback: () => T
): T => {
  const originalVars: Record<string, string | undefined> = {};

  // Set new environment variables
  Object.entries(vars).forEach(([key, value]) => {
    originalVars[key] = process.env[key];
    process.env[key] = value;
  });

  try {
    return callback();
  } finally {
    // Restore original values
    Object.entries(originalVars).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
};
