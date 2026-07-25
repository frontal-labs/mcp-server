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
import { vi } from "vitest";

// Test helper utilities

export const createMockEventEmitter = () => {
  const listeners: Record<string, ((...args: never[]) => unknown)[]> = {};

  return {
    on: vi.fn((event: string, callback: (...args: never[]) => unknown) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(callback);
    }),
    emit: vi.fn((event: string, ...args: never[]) => {
      if (listeners[event]) {
        listeners[event].forEach((callback) => {
          callback(...args);
        });
      }
    }),
    removeAllListeners: vi.fn((event?: string) => {
      if (event) {
        delete listeners[event];
      } else {
        Object.keys(listeners).forEach((key) => {
          delete listeners[key];
        });
      }
    }),
    listeners,
  };
};

export const createMockStream = () => {
  const data: Buffer[] = [];

  return {
    write: vi.fn((chunk: Buffer) => {
      data.push(chunk);
    }),
    data: () => Buffer.concat(data),
    reset: () => {
      data.length = 0;
    },
  };
};

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const createTestConfig = (overrides = {}) => ({
  apiKey: "test-api-key",
  baseUrl: "https://api.test.frontal.dev/v1",
  transport: { transport: "stdio" as const },
  auth: { type: "api-key" as const },
  services: {
    ai: true,
    blob: true,
    functions: true,
    graph: true,
    pipelines: true,
  },
  logLevel: "error" as const,
  verbose: false,
  ...overrides,
});

export const createMockFile = (
  name: string,
  content: string,
  type = "text/plain"
) => new File([content], name, { type });

export const createMockBuffer = (content: string): Buffer =>
  Buffer.from(content, "utf-8");

export const assertCalledWith = (
  mock: vi.MockedFunction<(...args: never[]) => unknown>,
  ...expected: never[]
) => {
  expect(mock).toHaveBeenCalledWith(...expected);
};

export const assertCalledWithContaining = (
  mock: vi.MockedFunction<(...args: never[]) => unknown>,
  ...expected: never[]
) => {
  expect(mock).toHaveBeenCalledWith(expect.objectContaining(...expected));
};

export const assertNotCalled = (
  mock: vi.MockedFunction<(...args: never[]) => unknown>
) => {
  expect(mock).not.toHaveBeenCalled();
};

export const assertCalledTimes = (
  mock: vi.MockedFunction<(...args: never[]) => unknown>,
  times: number
) => {
  expect(mock).toHaveBeenCalledTimes(times);
};
