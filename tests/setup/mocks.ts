import { vi } from "vitest";

// Global mock setup

// Mock fetch globally
export const setupMockFetch = () => {
  const mockFetch = vi.fn();
  global.fetch = mockFetch;
  return mockFetch;
};

// Mock console methods
export const setupMockConsole = () => {
  const mockConsole = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  global.console = mockConsole;
  return mockConsole;
};

// Mock process methods
export const setupMockProcess = () => {
  const mockProcess = {
    ...process,
    exit: vi.fn(),
    env: {
      ...process.env,
      NODE_ENV: "test",
    },
  };

  global.process = mockProcess as typeof process;
  return mockProcess;
};

// Create a mock spawn function for testing
// Note: To mock child_process.spawn in a test file, use vi.mock at the
// top level of that test file instead. This helper just creates the mock fn.
export const setupMockSpawn = () => {
  const mockSpawn = vi.fn(() => ({
    pid: 12345,
    killed: false,
    on: vi.fn(),
    kill: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    stdin: { write: vi.fn() },
  }));

  return mockSpawn;
};

// Mock File API
export const setupMockFile = () => {
  const mockFile = vi.fn(
    (content: unknown, name: string, options: Record<string, unknown>) => ({
      name,
      size: typeof content === "string" ? content.length : 0,
      type: (options?.type as string) || "text/plain",
      lastModified: new Date().toISOString(),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      text: vi.fn().mockResolvedValue(content),
      stream: vi.fn(),
    })
  );

  (global as Record<string, unknown>).File = mockFile;
  return mockFile;
};

// Mock setTimeout/setInterval
export const setupMockTimers = () => {
  vi.useFakeTimers();
};

// Restore all mocks
export const restoreAllMocks = () => {
  vi.restoreAllMocks();
  vi.useRealTimers();

  // Restore global objects
  if (typeof global !== "undefined") {
    const g = global as Record<string, unknown>;
    delete g.fetch;
    delete g.File;
    delete g.console;
  }
};
