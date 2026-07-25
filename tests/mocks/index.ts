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
// Mocks index file - exports all mock utilities
export * from "./api-mocks.js";
export * from "./data-generators.js";

// Re-export commonly used mock types
export type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
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
  config: unknown;
  createdAt: string;
};
