import { expect } from "vitest";

// Custom assertion helpers for better test readability

export const assertValidMcpResponse = (response: any) => {
  expect(response).toHaveProperty("jsonrpc", "2.0");
  expect(response).toHaveProperty("id");
  expect(response).toHaveProperty("result");
};

export const assertValidMcpError = (response: any, expectedCode?: number) => {
  expect(response).toHaveProperty("jsonrpc", "2.0");
  expect(response).toHaveProperty("id");
  expect(response).toHaveProperty("error");
  expect(response.error).toHaveProperty("code");
  expect(response.error).toHaveProperty("message");

  if (expectedCode !== undefined) {
    expect(response.error.code).toBe(expectedCode);
  }
};

export const assertValidTool = (tool: any) => {
  expect(tool).toHaveProperty("name");
  expect(tool).toHaveProperty("description");
  expect(tool).toHaveProperty("inputSchema");
  expect(tool.inputSchema).toHaveProperty("type", "object");
};

export const assertValidApiCall = (mock: any, url: string, method = "POST") => {
  expect(mock).toHaveBeenCalledWith(
    expect.stringContaining(url),
    expect.objectContaining({
      method,
      headers: expect.objectContaining({
        Authorization: expect.stringContaining("Bearer "),
        "Content-Type": "application/json",
      }),
    })
  );
};

export const assertSuccessfulResponse = (response: any) => {
  expect(response.ok).toBe(true);
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
};

export const assertErrorResponse = (response: any, expectedStatus?: number) => {
  expect(response.ok).toBe(false);
  expect(response.status).toBeGreaterThanOrEqual(400);

  if (expectedStatus !== undefined) {
    expect(response.status).toBe(expectedStatus);
  }
};

export const assertValidFileUpload = (result: any) => {
  expect(result).toHaveProperty("key");
  expect(result).toHaveProperty("url");
  expect(result).toHaveProperty("size");
  expect(result).toHaveProperty("etag");
  expect(typeof result.key).toBe("string");
  expect(typeof result.url).toBe("string");
  expect(typeof result.size).toBe("number");
};

export const assertValidAIResponse = (result: any) => {
  expect(result).toHaveProperty("text");
  expect(result).toHaveProperty("usage");
  expect(result.usage).toHaveProperty("tokens");
  expect(typeof result.text).toBe("string");
  expect(typeof result.usage.tokens).toBe("number");
};

export const assertValidEmbeddings = (result: any) => {
  expect(result).toHaveProperty("embeddings");
  expect(result).toHaveProperty("usage");
  expect(Array.isArray(result.embeddings)).toBe(true);
  expect(result.embeddings.length).toBeGreaterThan(0);
  expect(typeof result.embeddings[0]).toBe("number");
};

export const assertValidFunctionResult = (result: any) => {
  expect(result).toHaveProperty("statusCode");
  expect(result).toHaveProperty("body");
  expect(typeof result.statusCode).toBe("number");
  expect(typeof result.body).toBe("string");
};

export const assertValidGraphResult = (result: any) => {
  expect(result).toHaveProperty("results");
  expect(result).toHaveProperty("totalCount");
  expect(Array.isArray(result.results)).toBe(true);
  expect(typeof result.totalCount).toBe("number");
};

export const assertValidPipelineResult = (result: any) => {
  expect(result).toHaveProperty("id");
  expect(result).toHaveProperty("status");
  expect(typeof result.id).toBe("string");
  expect(typeof result.status).toBe("string");
};

export const assertErrorContains = (error: any, expectedMessage: string) => {
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toContain(expectedMessage);
};

export const assertErrorType = (error: any, expectedType: string) => {
  expect(error).toBeInstanceOf(Error);
  if (error.name) {
    expect(error.name).toBe(expectedType);
  }
};
