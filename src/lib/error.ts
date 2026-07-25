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
/**
 * Centralized error module for the Frontal MCP server.
 *
 * All custom error classes, the error-code vocabulary, response-envelope
 * parsing, and type guards live here so the rest of the codebase depends on a
 * single, stable error surface (`@/lib/error`). This module has no internal
 * dependencies — it sits at the bottom of the dependency graph.
 */

/** Canonical machine-readable error codes surfaced by the server. */
export const ERROR_CODE = {
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  RATE_LIMITED: "rate_limited",
  INVALID_REGION: "invalid_region",
  NOT_IMPLEMENTED: "not_implemented",
  NOT_FOUND: "not_found",
  TIMEOUT: "timeout",
  NETWORK_ERROR: "network_error",
  ABORTED: "aborted",
  UNKNOWN_OPERATION: "unknown_operation",
  MISSING_PARAMETER: "missing_parameter",
  INVALID_ARGUMENTS: "invalid_arguments",
  CONFIG_INVALID: "config_invalid",
  SPEC_INVALID: "spec_invalid",
  UPSTREAM: "upstream",
  UNKNOWN: "unknown",
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

/** HTTP statuses the edge treats as retryable (it performs no retries itself). */
export const RETRYABLE_STATUS: ReadonlySet<number> = new Set([
  429, 502, 503, 504,
]);

/** Contextual metadata attached to an error for logging/tracing. */
export interface ErrorContext {
  operationId?: string;
  method?: string;
  path?: string;
  requestId?: string;
  [key: string]: unknown;
}

/** Normalized error body, produced from any upstream error envelope shape. */
export interface ErrorEnvelope {
  code?: string;
  message: string;
  details?: unknown;
}

/**
 * Base class for every error the server raises. Carries a machine-readable
 * `code` and optional structured `context`; subclasses add domain specifics.
 */
export abstract class FrontalError extends Error {
  abstract readonly kind: string;

  constructor(
    message: string,
    readonly code: ErrorCode | string = ERROR_CODE.UNKNOWN,
    readonly context?: ErrorContext
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** An error returned by (or while talking to) the Frontal public API / edge. */
export class FrontalApiError extends FrontalError {
  readonly kind = "api";

  constructor(
    message: string,
    readonly httpStatus: number,
    code: ErrorCode | string = ERROR_CODE.UNKNOWN,
    readonly retryable: boolean = false,
    readonly details?: unknown,
    readonly requestId?: string
  ) {
    super(message, code, requestId ? { requestId } : undefined);
  }
}

/** Invalid or unusable server configuration. */
export class ConfigError extends FrontalError {
  readonly kind = "config";

  constructor(message: string, context?: ErrorContext) {
    super(message, ERROR_CODE.CONFIG_INVALID, context);
  }
}

/** A problem with the vendored OpenAPI spec or an unknown operation. */
export class SpecError extends FrontalError {
  readonly kind = "spec";

  constructor(
    message: string,
    code: ErrorCode | string = ERROR_CODE.SPEC_INVALID,
    context?: ErrorContext
  ) {
    super(message, code, context);
  }
}

/** Invalid tool input (missing path params, bad argument combinations). */
export class ToolInputError extends FrontalError {
  readonly kind = "tool_input";

  constructor(
    message: string,
    code: ErrorCode | string = ERROR_CODE.INVALID_ARGUMENTS,
    context?: ErrorContext
  ) {
    super(message, code, context);
  }
}

// --- Type guards ---------------------------------------------------------

export function isFrontalError(value: unknown): value is FrontalError {
  return value instanceof FrontalError;
}

export function isFrontalApiError(value: unknown): value is FrontalApiError {
  return value instanceof FrontalApiError;
}

/** Whether an error should be retried (API errors carry their own verdict). */
export function isRetryableError(error: unknown): boolean {
  if (isFrontalApiError(error)) {
    return error.retryable;
  }
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ECONNRESET" || code === "ETIMEDOUT";
  }
  return false;
}

// --- Error-envelope parsing ---------------------------------------------

type ErrorFields = Record<string, unknown>;

/** Gateway shape: `{ error: { code, message } }`. */
function gatewayError(
  obj: ErrorFields,
  fallback: string
): ErrorEnvelope | undefined {
  if (!(obj.error && typeof obj.error === "object")) {
    return;
  }
  const err = obj.error as ErrorFields;
  return {
    code: typeof err.code === "string" ? err.code : undefined,
    message: typeof err.message === "string" ? err.message : fallback,
  };
}

/** Geo-router shape: `{ error: string, message?: string }`. */
function geoRouterError(obj: ErrorFields): ErrorEnvelope | undefined {
  if (typeof obj.error !== "string") {
    return;
  }
  return {
    code: obj.error,
    message: typeof obj.message === "string" ? obj.message : obj.error,
  };
}

/** Backend google.rpc.Status shape: `{ code, message, details[] }`. */
function statusError(obj: ErrorFields): ErrorEnvelope | undefined {
  if (typeof obj.message !== "string") {
    return;
  }
  return {
    code: typeof obj.code === "string" ? obj.code : undefined,
    message: obj.message,
    details: obj.details,
  };
}

/**
 * Identity/IAM shape (`iam_ErrorSchema`, governs `/token`, `/user`, `/admin/*`):
 * `{ code, msg, error_code }`, with `error_description` used by OAuth-style
 * token errors. Prefer the machine-readable `error_code`, falling back to a
 * stringified numeric `code`.
 */
function identityError(
  obj: ErrorFields,
  fallback: string
): ErrorEnvelope | undefined {
  const message =
    typeof obj.msg === "string"
      ? obj.msg
      : typeof obj.error_description === "string"
        ? obj.error_description
        : undefined;
  let code: string | undefined;
  if (typeof obj.error_code === "string") {
    code = obj.error_code;
  } else if (typeof obj.code === "number") {
    code = String(obj.code);
  } else if (typeof obj.code === "string") {
    code = obj.code;
  }
  if (message === undefined && code === undefined) {
    return;
  }
  return { code, message: message ?? fallback };
}

/**
 * Parse the distinct edge error envelopes (gateway, geo-router, backend
 * google.rpc.Status, identity/IAM) into a single normalized
 * {@link ErrorEnvelope}.
 */
export function parseErrorEnvelope(
  body: unknown,
  fallbackMessage: string
): ErrorEnvelope {
  if (!(body && typeof body === "object")) {
    return { message: fallbackMessage };
  }
  const obj = body as ErrorFields;
  return (
    gatewayError(obj, fallbackMessage) ??
    geoRouterError(obj) ??
    statusError(obj) ??
    identityError(obj, fallbackMessage) ?? { message: fallbackMessage }
  );
}
