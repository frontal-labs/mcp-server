import { randomUUID } from "node:crypto";
import type { Logger } from "winston";
import {
  ERROR_CODE,
  FrontalApiError,
  parseErrorEnvelope,
  RETRYABLE_STATUS,
} from "@/lib/error.js";

/**
 * Thin, spec-aware HTTP client for the Frontal public API (api.frontal.dev).
 *
 * Implements the client-facing contract imposed by the production edge
 * (Cloudflare → geo-router → REST gateway → regional backend):
 *   - Bearer `frt_` auth (the edge exchanges the key for an internal JWT).
 *   - Optional region pinning via the `x-frontal-region` header.
 *   - Retry matrix that mirrors the edge (retry 429/502/503/504 + transport
 *     errors; never retry 401/409/501/other 4xx).
 *   - `Retry-After` / `x-ratelimit-*` aware backoff.
 *   - Idempotency keys on retried writes (the edge does NOT dedupe).
 *   - Normalizes the three distinct error envelopes into one error type.
 *
 * Error types and envelope parsing live in `@/lib/error`.
 */

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Public edge endpoints that must NOT carry an Authorization header. */
const UNAUTHENTICATED_PATHS = new Set([
  "/health",
  "/regions",
  "/resolve",
  "/status",
  "/metrics",
]);
const DEFAULT_TIMEOUT_MS = 35_000; // > the edge's 30s upstream timeout
const DEFAULT_MAX_PAGES = 100;
const MILLIS_PER_SECOND = 1000;

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
}

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 500,
  maxDelay: 10_000,
  jitter: true,
};

export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  reset?: string;
}

export interface FrontalClientOptions {
  baseUrl: string;
  apiKey?: string;
  /** Default region pin (`x-frontal-region`). */
  region?: string;
  logger: Logger;
  retry?: Partial<RetryConfig>;
  timeoutMs?: number;
}

export interface RequestOptions {
  /** Query params; arrays are repeated, nullish values omitted. */
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Per-call bearer token; overrides the client's configured apiKey. */
  token?: string;
  /** Per-call region pin; overrides the client default. */
  region?: string;
  /** Idempotency key for writes; auto-generated for writes if omitted. */
  idempotencyKey?: string;
  /** Skip auth (for public geo endpoints and `/v1/auth/*`). */
  skipAuth?: boolean;
  /** Caller-supplied cancellation signal. */
  signal?: AbortSignal;
}

export interface FrontalResponse<T = unknown> {
  data: T;
  status: number;
  rateLimit: RateLimitInfo;
  requestId: string;
}

/** Result of a single fetch attempt inside the retry loop. */
type AttemptOutcome<T> =
  | { ok: true; response: FrontalResponse<T> }
  | { ok: false; error: FrontalApiError; retryAfter: string | null };

export class FrontalClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly region?: string;
  private readonly logger: Logger;
  private readonly retry: RetryConfig;
  private readonly timeoutMs: number;

  constructor(options: FrontalClientOptions) {
    // Strip a trailing slash and a stray `/v1` suffix — versioned paths already
    // include `/v1/`, so the base must be the bare host.
    let base = options.baseUrl;
    while (base.endsWith("/")) {
      base = base.slice(0, -1);
    }
    if (base.endsWith("/v1")) {
      base = base.slice(0, -3);
    }
    this.baseUrl = base;
    this.apiKey = options.apiKey || undefined;
    this.region = options.region || undefined;
    this.logger = options.logger;
    this.retry = { ...DEFAULT_RETRY, ...options.retry };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private static appendQueryParam(url: URL, key: string, value: unknown): void {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
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
    if (options.skipAuth || this.isPublicPath(path)) {
      return null;
    }
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
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    const token = this.resolveToken(options, path);
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
    const region = options.region ?? this.region;
    if (region) {
      headers.set("x-frontal-region", region);
    }
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
    // Honor Retry-After (seconds) when the edge provides it.
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
    if (!text) {
      return null;
    }
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

  /** Perform a single request with retry/backoff and error normalization. */
  async request<T = unknown>(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<FrontalResponse<T>> {
    const upperMethod = method.toUpperCase();
    const requestId = randomUUID();

    // Stable across retries so the edge can dedupe retried writes.
    const idempotencyKey = WRITE_METHODS.has(upperMethod)
      ? (options.idempotencyKey ?? randomUUID())
      : undefined;

    // Fail fast on missing auth rather than making a doomed round-trip, unless
    // the caller opted out (skipAuth) or the endpoint is public.
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
      if (outcome.ok) {
        return outcome.response;
      }
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

  /** Run one fetch attempt: resolve to a response or a (maybe retryable) error. */
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

  /** Map a thrown fetch error to a retryable transport error (or rethrow). */
  private mapTransportError<T>(
    error: unknown,
    callerSignal: AbortSignal | undefined,
    requestId: string
  ): AttemptOutcome<T> {
    if (error instanceof FrontalApiError) {
      throw error;
    }
    // A caller-initiated abort is terminal; our own timeout is retryable.
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

  /**
   * Auto-paginate a cursor-paginated GET, following `next_cursor` until it is
   * absent or `maxPages` is reached. Returns the array of raw page bodies.
   */
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
      if (cursor) {
        query[cursorParam] = cursor;
      }
      const response = await this.request("GET", path, { ...options, query });
      pages.push(response.data);
      const next = this.extractNextCursor(response.data);
      if (!next) {
        break;
      }
      cursor = next;
    }
    return pages;
  }

  private extractNextCursor(data: unknown): string | undefined {
    if (data && typeof data === "object") {
      const next = (data as Record<string, unknown>).next_cursor;
      if (typeof next === "string" && next.length > 0) {
        return next;
      }
    }
    return;
  }
}
