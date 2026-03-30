// Load utilities index file - exports all loading utilities
export * from "./test-loader.js";

// Re-export commonly used loading functions
export { TestLoader } from "./test-loader.js";

// Convenience exports
export const loadConfig = (env = "test") =>
  TestLoader.loadConfig(`config/${env}.json`);

export const loadFixture = (name: string) => TestLoader.loadFixture(name);

export const loadScenario = (name: string) => TestLoader.loadScenario(name);

export const createMockForScenario = (scenario: string) =>
  TestLoader.createMockFetchForScenario(scenario);
