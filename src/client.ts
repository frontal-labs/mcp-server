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
import { randomUUID } from "node:crypto";
import type { Logger } from "winston";
import {
  ERROR_CODE,
  FrontalApiError,
  parseErrorEnvelope,
  RETRYABLE_STATUS,
} from "@/types/errors.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const UNAUTHENTICATED_PATHS = new Set([
  "/health",
  "/regions",
  "/resolve",
  "/status",
  "/metrics",
]);
const DEFAULT_TIMEOUT_MS = 35_000;
const DEFAULT_MAX_PAGES = 100;
const MILLIS_PER_SECOND = 1000;

const DEFAULT_RETRY = {
  maxAttempts: 3,
  baseDelay: 500,
  maxDelay: 10_000,
  jitter: true,
};

export interface FrontalClientOptions {
  baseUrl: string;
  apiKey?: string;
  region?: string;
  logger: Logger;
  retry?: Partial<typeof DEFAULT_RETRY>;
  timeoutMs?: number;
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  token?: string;
  region?: string;
  idempotencyKey?: string;
  skipAuth?: boolean;
  signal?: AbortSignal;
}

export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  reset?: string;
}

export interface FrontalResponse<T = unknown> {
  data: T;
  status: number;
  rateLimit: RateLimitInfo;
  requestId: string;
}

type AttemptOutcome<T> =
  | { ok: true; response: FrontalResponse<T> }
  | { ok: false; error: FrontalApiError; retryAfter: string | null };

export class FrontalClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly region?: string;
  private readonly logger: Logger;
  private readonly retry: typeof DEFAULT_RETRY;
  private readonly timeoutMs: number;

  constructor(options: FrontalClientOptions) {
    let base = options.baseUrl;
    while (base.endsWith("/")) base = base.slice(0, -1);
    if (base.endsWith("/v1")) base = base.slice(0, -3);
    this.baseUrl = base;
    this.apiKey = options.apiKey || undefined;
    this.region = options.region || undefined;
    this.logger = options.logger;
    this.retry = { ...DEFAULT_RETRY, ...options.retry };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private static appendQueryParam(url: URL, key: string, value: unknown): void {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      FrontalClient.appendQueryParam(url, key, value);
    }
    return url.toString();
  }

  private isPublicPath(path: string): boolean {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return (
      UNAUTHENTICATED_PATHS.has(normalized) ||
      normalized.startsWith("/v1/auth/")
    );
  }

  private resolveToken(options: RequestOptions, path: string): string | null {
    if (options.skipAuth || this.isPublicPath(path)) return null;
    return options.token || this.apiKey || null;
  }

  private buildHeaders(
    method: string,
    path: string,
    options: RequestOptions,
    idempotencyKey: string | undefined,
    requestId: string
  ): Headers {
    const headers = new Headers({
      accept: "application/json",
      "x-request-id": requestId,
    });
    if (options.body !== undefined)
      headers.set("content-type", "application/json");
    const token = this.resolveToken(options, path);
    if (token) headers.set("authorization", `Bearer ${token}`);
    const region = options.region ?? this.region;
    if (region) headers.set("x-frontal-region", region);
    if (idempotencyKey && WRITE_METHODS.has(method)) {
      headers.set("x-frontal-idempotency-key", idempotencyKey);
    }
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      headers.set(key, value);
    }
    return headers;
  }

  private readRateLimit(headers: Headers): RateLimitInfo {
    const limit = headers.get("x-ratelimit-limit");
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");
    return {
      limit: limit ? Number(limit) : undefined,
      remaining: remaining ? Number(remaining) : undefined,
      reset: reset ?? undefined,
    };
  }

  private backoffDelay(
    attempt: number,
    retryAfterHeader: string | null
  ): number {
    if (retryAfterHeader) {
      const seconds = Number(retryAfterHeader);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(seconds * MILLIS_PER_SECOND, this.retry.maxDelay);
      }
    }
    const exp = this.retry.baseDelay * 2 ** (attempt - 1);
    const jitter = this.retry.jitter ? Math.random() * 0.1 * exp : 0;
    return Math.min(exp + jitter, this.retry.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async parseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return text;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<FrontalResponse<T>> {
    const upperMethod = method.toUpperCase();
    const requestId = randomUUID();

    const idempotencyKey = WRITE_METHODS.has(upperMethod)
      ? (options.idempotencyKey ?? randomUUID())
      : undefined;

    const authRequired = !(options.skipAuth || this.isPublicPath(path));
    if (authRequired && this.resolveToken(options, path) === null) {
      throw new FrontalApiError(
        "Authentication required: no Frontal API key provided. Set FRONTAL_API_KEY or pass an Authorization header.",
        401,
        ERROR_CODE.UNAUTHORIZED,
        false,
        undefined,
        requestId
      );
    }

    const url = this.buildUrl(path, options.query);
    const headers = this.buildHeaders(
      upperMethod,
      path,
      options,
      idempotencyKey,
      requestId
    );
    const bodyInit =
      options.body === undefined ? undefined : JSON.stringify(options.body);

    let lastError: FrontalApiError | undefined;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt++) {
      const outcome = await this.runAttempt<T>({
        url,
        method: upperMethod,
        headers,
        bodyInit,
        signal: options.signal,
        requestId,
      });
      if (outcome.ok) return outcome.response;
      lastError = outcome.error;
      if (!outcome.error.retryable || attempt === this.retry.maxAttempts) {
        throw outcome.error;
      }
      const delay = this.backoffDelay(attempt, outcome.retryAfter);
      this.logger.warn(
        `Frontal API ${upperMethod} ${path} -> ${outcome.error.httpStatus}; retrying in ${delay}ms (attempt ${attempt}/${this.retry.maxAttempts})`
      );
      await this.sleep(delay);
    }

    throw (
      lastError ??
      new FrontalApiError(
        "Request failed",
        500,
        ERROR_CODE.UNKNOWN,
        false,
        undefined,
        requestId
      )
    );
  }

  private async runAttempt<T>(args: {
    url: string;
    method: string;
    headers: Headers;
    bodyInit?: string;
    signal?: AbortSignal;
    requestId: string;
  }): Promise<AttemptOutcome<T>> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), this.timeoutMs);
    const signal = args.signal
      ? AbortSignal.any([args.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(args.url, {
        method: args.method,
        headers: args.headers,
        body: args.bodyInit,
        redirect: "manual",
        signal,
      });
      const rateLimit = this.readRateLimit(response.headers);
      const body = await this.parseBody(response);

      if (response.ok) {
        return {
          ok: true,
          response: {
            data: body as T,
            status: response.status,
            rateLimit,
            requestId: args.requestId,
          },
        };
      }

      const envelope = parseErrorEnvelope(
        body,
        `Request failed with status ${response.status}`
      );
      return {
        ok: false,
        error: new FrontalApiError(
          envelope.message,
          response.status,
          envelope.code,
          RETRYABLE_STATUS.has(response.status),
          envelope.details,
          args.requestId
        ),
        retryAfter: response.headers.get("retry-after"),
      };
    } catch (error) {
      return this.mapTransportError(error, args.signal, args.requestId);
    } finally {
      clearTimeout(timeout);
    }
  }

  private mapTransportError<T>(
    error: unknown,
    callerSignal: AbortSignal | undefined,
    requestId: string
  ): AttemptOutcome<T> {
    if (error instanceof FrontalApiError) throw error;
    if (callerSignal?.aborted) {
      throw new FrontalApiError(
        "Request aborted by caller",
        499,
        ERROR_CODE.ABORTED,
        false,
        undefined,
        requestId
      );
    }
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: new FrontalApiError(
        isTimeout
          ? `Request timed out after ${this.timeoutMs}ms`
          : `Network error: ${(error as Error).message}`,
        isTimeout ? 504 : 503,
        isTimeout ? ERROR_CODE.TIMEOUT : ERROR_CODE.NETWORK_ERROR,
        true,
        undefined,
        requestId
      ),
      retryAfter: null,
    };
  }

  async paginate(
    path: string,
    options: RequestOptions & { cursorParam?: string; maxPages?: number } = {}
  ): Promise<unknown[]> {
    const cursorParam = options.cursorParam ?? "cursor";
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    const pages: unknown[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const query = { ...options.query };
      if (cursor) query[cursorParam] = cursor;
      const response = await this.request("GET", path, { ...options, query });
      pages.push(response.data);
      const next = this.extractNextCursor(response.data);
      if (!next) break;
      cursor = next;
    }
    return pages;
  }

  private extractNextCursor(data: unknown): string | undefined {
    if (data && typeof data === "object") {
      const next = (data as Record<string, unknown>).next_cursor;
      if (typeof next === "string" && next.length > 0) return next;
    }
  }
}
