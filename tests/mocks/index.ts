// Mocks index file - exports all mock utilities
export * from "./api-mocks.js";
export * from "./data-generators.js";

// Re-export commonly used mock types
export type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
  headers?: Map<string, string>;
};

export type MockFile = {
  name: string;
  content: string;
  size: number;
  type: string;
  lastModified: string;
};

export type MockUser = {
  id: string;
  email: string;
  name: string;
  apiKey: string;
  createdAt: string;
};

export type MockProject = {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type MockFunction = {
  name: string;
  runtime: string;
  handler: string;
  memory: number;
  timeout: number;
  environment: Record<string, string>;
  lastModified: string;
};

export type MockPipeline = {
  id: string;
  name: string;
  description: string;
  status: string;
  config: any;
  createdAt: string;
};
