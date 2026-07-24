import {
  ERROR_CODE,
  FrontalApiError,
  isFrontalError,
  SpecError,
  ToolInputError,
} from "@/lib/error.js";
import type { AdapterContext } from "./types.js";

/** Shape of an MCP tool handler result (text content, optional error flag). */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  // The MCP SDK's CallToolResult carries an open index signature.
  [key: string]: unknown;
}

/** Wrap a JSON-serializable value as a successful tool result. */
export function toToolResult(data: unknown): ToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** HTTP-status-specific guidance appended to API error messages. */
function apiErrorHint(status: number): string | undefined {
  if (status === 401) {
    return "Provide a valid Frontal API key (frt_...) via FRONTAL_API_KEY or the Authorization header.";
  }
  if (status === 409) {
    return "The pinned region was rejected. Check FRONTAL_REGION (e.g. iad, lhr, fra, sin).";
  }
  if (status === 501) {
    return "This endpoint is not currently enabled at the edge.";
  }
  return;
}

/** Turn any thrown error into a descriptive, non-throwing tool error result. */
export function toToolError(error: unknown): ToolResult {
  if (error instanceof FrontalApiError) {
    const parts = [
      `Frontal API error (${error.httpStatus}${error.code ? ` ${error.code}` : ""}): ${error.message}`,
    ];
    const hint = apiErrorHint(error.httpStatus);
    if (hint) {
      parts.push(hint);
    }
    if (error.details !== undefined) {
      parts.push(`Details: ${JSON.stringify(error.details)}`);
    }
    return errorResult(parts.join("\n"));
  }
  if (isFrontalError(error)) {
    return errorResult(`${error.kind} error (${error.code}): ${error.message}`);
  }
  const message = error instanceof Error ? error.message : String(error);
  return errorResult(`Error: ${message}`);
}

/**
 * Substitute `{name}` path params in a templated path. Values are URL-encoded,
 * but an embedded `/` is preserved so catch-all params (declared upstream as
 * `{name:path}` and vendored here as plain `{name}`) route as real path
 * segments instead of collapsing into a single `%2F`-escaped segment.
 */
export function substitutePath(
  templatePath: string,
  pathParams: Record<string, string | number> = {}
): string {
  return templatePath.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = pathParams[name];
    if (value === undefined) {
      throw new ToolInputError(
        `Missing required path parameter: ${name}`,
        ERROR_CODE.MISSING_PARAMETER,
        { path: templatePath }
      );
    }
    return encodeURIComponent(String(value)).replace(/%2F/gi, "/");
  });
}

export interface CallOperationInput {
  pathParams?: Record<string, string | number>;
  query?: Record<string, unknown>;
  body?: unknown;
  autoPaginate?: boolean;
  /** Stable key for retry-safe writes; forwarded to the edge as-is. */
  idempotencyKey?: string;
}

/**
 * Invoke a spec operation by its `operationId`, substituting path params and
 * forwarding the current request's token. Returns the parsed response data.
 */
export async function callOperation(
  ctx: AdapterContext,
  operationId: string,
  input: CallOperationInput = {}
): Promise<unknown> {
  const op = ctx.spec.getByOperationId(operationId);
  if (!op) {
    throw new SpecError(
      `Unknown operationId: ${operationId}`,
      ERROR_CODE.UNKNOWN_OPERATION,
      { operationId }
    );
  }
  const path = substitutePath(op.path, input.pathParams);
  const token = ctx.getToken();

  if (input.autoPaginate && op.method === "get") {
    const pages = await ctx.client.paginate(path, {
      query: input.query,
      token,
    });
    return { pages };
  }

  const response = await ctx.client.request(op.method.toUpperCase(), path, {
    query: input.query,
    body: input.body,
    token,
    idempotencyKey: input.idempotencyKey,
  });
  return response.data;
}
