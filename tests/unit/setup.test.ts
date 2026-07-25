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
import {
  createFetchError,
  createFetchResponse,
  mockGlobalFetch,
} from "@tests/utils/mock-factory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    const response = createFetchResponse({ data: "test" }, true, 201);

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
