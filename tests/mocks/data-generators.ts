// Data generators for creating test data

export const generateTestFile = (overrides = {}) => ({
  name: "test-file.txt",
  content: "Test file content",
  size: 1024,
  type: "text/plain",
  lastModified: new Date().toISOString(),
  ...overrides,
});

export const generateTestImage = (overrides = {}) => ({
  name: "test-image.jpg",
  content: "fake-image-data",
  size: 2048,
  type: "image/jpeg",
  width: 800,
  height: 600,
  ...overrides,
});

export const generateTestUser = (overrides = {}) => ({
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  apiKey: "test-api-key-12345",
  createdAt: new Date().toISOString(),
  ...overrides,
});

export const generateTestProject = (overrides = {}) => ({
  id: "project-123",
  name: "Test Project",
  description: "A test project for development",
  status: "active",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

export const generateTestFunction = (overrides = {}) => ({
  name: "test-function",
  runtime: "nodejs18",
  handler: "index.handler",
  memory: 256,
  timeout: 30,
  environment: {},
  lastModified: new Date().toISOString(),
  ...overrides,
});

export const generateTestPipeline = (overrides = {}) => ({
  id: "pipeline-123",
  name: "test-pipeline",
  description: "A test pipeline",
  status: "created",
  config: {
    steps: [],
    schedule: "daily",
  },
  createdAt: new Date().toISOString(),
  ...overrides,
});

export const generateTestGraph = (overrides = {}) => ({
  nodes: [
    {
      id: "node-1",
      labels: ["Person"],
      properties: {
        name: "John Doe",
        age: 30,
      },
    },
  ],
  relationships: [],
  totalCount: 1,
  ...overrides,
});

export const generateTestBlob = (overrides = {}) => ({
  objects: [
    {
      key: "documents/report.pdf",
      size: 2048,
      lastModified: "2024-01-01T12:00:00Z",
      etag: '"abc123"',
    },
    {
      key: "images/photo.jpg",
      size: 1024,
      lastModified: "2024-01-02T15:30:00Z",
      etag: '"def456"',
    },
  ],
  totalCount: 2,
  isTruncated: false,
  ...overrides,
});

export const generateTestAIResponse = (overrides = {}) => ({
  text: "This is a generated response from the AI model.",
  usage: {
    prompt_tokens: 10,
    completion_tokens: 15,
    total_tokens: 25,
  },
  model: "gpt-3.5-turbo",
  finish_reason: "stop",
  ...overrides,
});

export const generateTestEmbeddings = (overrides = {}) => ({
  data: [
    {
      object: "embedding",
      embedding: [0.002, -0.003, 0.045, -0.023, 0.016],
      index: 0,
    },
  ],
  usage: {
    prompt_tokens: 8,
    total_tokens: 8,
  },
  model: "text-embedding-ada-002",
  ...overrides,
});

export const generateTestImageResponse = (overrides = {}) => ({
  image_url: "https://oaidalleapiprodscus.blob.core.windows.net/test-image.png",
  revised_prompt: "A beautiful landscape with mountains",
  usage: {
    prompt_tokens: 20,
    total_tokens: 20,
  },
  ...overrides,
});

// Helper to generate random test data
export const generateRandomId = (prefix = "test") =>
  `${prefix}-${Math.random().toString(36).substring(7)}`;

export const generateRandomEmail = () =>
  `test-${Math.random().toString(36).substring(7)}@example.com`;

export const generateRandomName = () =>
  `Test ${Math.random().toString(36).substring(7)}`;

export const generateRandomTimestamp = () =>
  new Date(
    Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000
  ).toISOString();

// Array generators
export const generateTestArray = (generator: () => any, count: number) =>
  Array.from({ length: count }, () => generator());

export const generateTestFiles = (count: number) =>
  generateTestArray(() => generateTestFile(), count);

export const generateTestUsers = (count: number) =>
  generateTestArray(() => generateTestUser(), count);

export const generateTestProjects = (count: number) =>
  generateTestArray(() => generateTestProject(), count);
