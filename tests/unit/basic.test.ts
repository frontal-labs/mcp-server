import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("Basic Test Setup", () => {
  beforeAll(() => {
    console.log("Setting up tests");
  });

  afterAll(() => {
    console.log("Cleaning up tests");
  });

  it("should run a basic test", () => {
    expect(1 + 1).toBe(2);
  });

  it("should handle async operations", async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });

  it("should mock basic functionality", () => {
    const mockFn = vi.fn();
    mockFn("test");
    expect(mockFn).toHaveBeenCalledWith("test");
  });

  it("should have test environment", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });
});
