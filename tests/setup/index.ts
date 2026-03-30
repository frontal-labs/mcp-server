// Main setup file that imports all setup modules
export * from "./environment.js";
export * from "./mocks.js";

// Re-export commonly used utilities
import { afterAll, beforeAll } from "vitest";

// Global test configuration
beforeAll(() => {
  // Set up global test environment
  if (typeof global !== "undefined") {
    (global as Record<string, unknown>).test = true;
  }
});

afterAll(() => {
  // Global cleanup
  if (typeof global !== "undefined") {
    delete (global as Record<string, unknown>).test;
  }
});

// Export common test patterns
export const createTestSuite = (name: string, tests: () => void) => {
  describe(name, tests);
};

export const createDescribeBlock = (name: string, fn: () => void) => {
  return describe(name, fn);
};

export const createTestBlock = (
  name: string,
  fn: () => void | Promise<void>
) => {
  return it(name, fn);
};
