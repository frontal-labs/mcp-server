/*
 * Copyright 2026 Frontal Labs, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
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
