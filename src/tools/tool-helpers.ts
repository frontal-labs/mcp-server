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
import type { AdapterContext } from "@/tools/types.js";
import { SpecError, ToolInputError } from "@/types/errors.js";

export interface CallOperationInput {
  pathParams?: Record<string, string | number>;
  query?: Record<string, unknown>;
  body?: unknown;
  autoPaginate?: boolean;
  idempotencyKey?: string;
}

export function substitutePath(
  path: string,
  params?: Record<string, string | number>,
  catchAllParams?: string[]
): string {
  if (!params) return path;
  const catchAllSet = new Set(catchAllParams ?? []);
  return path.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = params[key];
    if (value === undefined) {
      throw new ToolInputError(
        `Missing required path parameter: ${key}`,
        "missing_parameter"
      );
    }
    if (catchAllSet.has(key)) {
      return String(value);
    }
    return encodeURIComponent(String(value));
  });
}

interface ToolContent {
  type: "text";
  text: string;
  annotations?: {
    audience?: ("user" | "assistant")[];
    priority?: number;
    lastModified?: string;
  };
  _meta?: Record<string, unknown>;
}

export function toToolError(error: unknown): {
  isError: boolean;
  content: ToolContent[];
} {
  if (error instanceof Error) {
    let message = error.message;
    if (error.name === "FrontalApiError") {
      const apiError = error as { httpStatus?: number; details?: unknown };
      if (apiError.httpStatus === 401) {
        message +=
          "\nHint: Check your API key or authentication configuration.";
      } else if (apiError.httpStatus === 409) {
        message += "\nHint: The region may be invalid or already in use.";
      } else if (apiError.httpStatus === 501) {
        message += "\nHint: This feature is not currently enabled.";
      }
      if (apiError.details) {
        message += `\nDetails: ${JSON.stringify(apiError.details)}`;
      }
    }
    return {
      isError: true,
      content: [{ type: "text", text: message }],
    };
  }
  return {
    isError: true,
    content: [{ type: "text", text: String(error) }],
  };
}

export function toToolResult<T>(data: T): {
  content: ToolContent[];
} {
  if (typeof data === "string") {
    return { content: [{ type: "text", text: data }] };
  }
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export async function callOperation(
  ctx: AdapterContext,
  operationId: string,
  input: CallOperationInput
): Promise<unknown> {
  const op = ctx.spec.getByOperationId(operationId);
  if (!op) {
    throw new SpecError(
      `Unknown operationId: ${operationId}`,
      "unknown_operation",
      { operationId }
    );
  }

  const resolvedPath = substitutePath(
    op.path,
    input.pathParams,
    op.catchAllParams
  );
  const token = ctx.getToken();

  if (op.requiresAuth && !token) {
    throw new SpecError(
      `Authentication required for operation: ${operationId}`,
      "unauthorized",
      { operationId }
    );
  }

  if (input.autoPaginate && op.method === "get") {
    return ctx.client.paginate(resolvedPath, {
      query: input.query,
      token,
      idempotencyKey: input.idempotencyKey,
    });
  }

  const response = await ctx.client.request(
    op.method.toUpperCase(),
    resolvedPath,
    {
      query: input.query,
      body: input.body,
      token,
      idempotencyKey: input.idempotencyKey,
    }
  );

  return response.data;
}
