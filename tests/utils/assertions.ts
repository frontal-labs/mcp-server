import { expect } from "vitest";

type JsonObject = Record<string, unknown>;

export const assertValidMcpResponse = (response: JsonObject) => {
  expect(response).toHaveProperty("jsonrpc", "2.0");
  expect(response).toHaveProperty("id");
  expect(response).toHaveProperty("result");
};

export const assertValidMcpError = (
  response: JsonObject,
  expectedCode?: number
) => {
  expect(response).toHaveProperty("jsonrpc", "2.0");
  expect(response).toHaveProperty("id");
  expect(response).toHaveProperty("error");
  expect(response.error).toHaveProperty("code");
  expect(response.error).toHaveProperty("message");

  if (expectedCode !== undefined) {
    expect((response.error as JsonObject).code).toBe(expectedCode);
  }
};

export const assertValidTool = (tool: JsonObject) => {
  expect(tool).toHaveProperty("name");
  expect(tool).toHaveProperty("description");
  expect(tool).toHaveProperty("inputSchema");
  expect(tool.inputSchema).toHaveProperty("type", "object");
};

export const assertValidApiCall = (
  mock: unknown,
  url: string,
  method = "POST"
) => {
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

export const assertSuccessfulResponse = (response: {
  ok: boolean;
  status: number;
}) => {
  expect(response.ok).toBe(true);
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
};

export const assertErrorResponse = (
  response: { ok: boolean; status: number },
  expectedStatus?: number
) => {
  expect(response.ok).toBe(false);
  expect(response.status).toBeGreaterThanOrEqual(400);

  if (expectedStatus !== undefined) {
    expect(response.status).toBe(expectedStatus);
  }
};

export const assertValidFileUpload = (result: JsonObject) => {
  expect(result).toHaveProperty("key");
  expect(result).toHaveProperty("url");
  expect(result).toHaveProperty("size");
  expect(result).toHaveProperty("etag");
  expect(typeof result.key).toBe("string");
  expect(typeof result.url).toBe("string");
  expect(typeof result.size).toBe("number");
};

export const assertValidAIResponse = (result: JsonObject) => {
  expect(result).toHaveProperty("text");
  expect(result).toHaveProperty("usage");
  expect(result.usage).toHaveProperty("tokens");
  expect(typeof result.text).toBe("string");
  expect(typeof (result.usage as JsonObject).tokens).toBe("number");
};

export const assertValidEmbeddings = (result: JsonObject) => {
  expect(result).toHaveProperty("embeddings");
  expect(result).toHaveProperty("usage");
  expect(Array.isArray(result.embeddings)).toBe(true);
  expect((result.embeddings as unknown[]).length).toBeGreaterThan(0);
  expect(typeof (result.embeddings as unknown[])[0]).toBe("number");
};

export const assertValidFunctionResult = (result: JsonObject) => {
  expect(result).toHaveProperty("statusCode");
  expect(result).toHaveProperty("body");
  expect(typeof result.statusCode).toBe("number");
  expect(typeof result.body).toBe("string");
};

export const assertValidGraphResult = (result: JsonObject) => {
  expect(result).toHaveProperty("results");
  expect(result).toHaveProperty("totalCount");
  expect(Array.isArray(result.results)).toBe(true);
  expect(typeof result.totalCount).toBe("number");
};

export const assertValidPipelineResult = (result: JsonObject) => {
  expect(result).toHaveProperty("id");
  expect(result).toHaveProperty("status");
  expect(typeof result.id).toBe("string");
  expect(typeof result.status).toBe("string");
};

export const assertErrorContains = (error: Error, expectedMessage: string) => {
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toContain(expectedMessage);
};

export const assertErrorType = (error: Error, expectedType: string) => {
  expect(error).toBeInstanceOf(Error);
  if (error.name) {
    expect(error.name).toBe(expectedType);
  }
};
