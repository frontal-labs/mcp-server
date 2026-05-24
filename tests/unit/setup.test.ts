import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFetchResponse, createFetchError, mockGlobalFetch } from "@tests/utils/mock-factory.js";

describe("Test Setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should setup mock fetch correctly", () => {
    const mockResponse = createFetchResponse({ data: "test" });
    mockGlobalFetch(mockResponse);

    expect(global.fetch).toBeDefined();
    expect(vi.isMockFunction(global.fetch)).toBe(true);
  });

  it("should create mock response with correct structure", () => {
    const response = createFetchResponse(
      { data: "test" },
      true,
      201
    );

    expect(response.ok).toBe(true);
    expect(response.status).toBe(201);
    expect(typeof response.json).toBe("function");
  });

  it("should create mock error with correct structure", () => {
    const error = createFetchError("test error", 400);

    expect(error.ok).toBe(false);
    expect(error.status).toBe(400);
  });
});
