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
import { AsyncLocalStorage } from "node:async_hooks";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  createMcpHandler,
  type McpHttpHandler,
  type McpServerFactory,
} from "@modelcontextprotocol/server";
import type { Logger } from "winston";
import { runWithToken } from "./auth.js";
import { type RateLimiter, rateLimitIdentifier } from "./rate-limit.js";

function extractBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header) return;
  const trimmed = header.trim();
  const separator = trimmed.search(/\s/);
  if (separator === -1) return;
  if (trimmed.slice(0, separator).toLowerCase() !== "bearer") return;
  const token = trimmed.slice(separator + 1).trim();
  return token || undefined;
}

const DEFAULT_MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;

/**
 * How an authenticated MCP request was served:
 *
 * - `modern`: protocol revision 2026-07-28;
 * - `legacy`: a 2025-era request, served by the stateless fallback;
 * - `rejected`: answered before any server was built (for example `GET` or
 *   `DELETE`, a malformed envelope, or an unsupported protocol version).
 */
export type RequestEra = "modern" | "legacy" | "rejected";

/** Carries the era out of the server factory, which the SDK calls per request. */
const eraStore = new AsyncLocalStorage<{ era?: "modern" | "legacy" }>();

/** The standard MCP request headers of protocol revision 2026-07-28. */
const MCP_HEADERS = "MCP-Protocol-Version, Mcp-Method, Mcp-Name";

/**
 * Response headers this transport owns. The MCP handler never sets them, and
 * copying them from its response would clobber the values set here.
 */
const TRANSPORT_OWNED_HEADERS = new Set([
  "access-control-allow-origin",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-expose-headers",
  "vary",
]);

class PayloadTooLargeError extends Error {
  constructor(limit: number) {
    super(`Request body exceeds the ${limit} byte limit`);
    this.name = "PayloadTooLargeError";
  }
}

export interface HttpTransportOptions {
  allowedHosts?: string[];
  allowedOrigins?: string[];
  maxRequestBodyBytes?: number;
  rateLimiter?: RateLimiter;
}

/**
 * The HTTP front door: a `node:http` server that applies CORS, the host
 * allow-list, `GET /health`, bearer authentication, rate limiting and the
 * body-size limit, then hands the request to the SDK's MCP handler.
 *
 * It is stateless. The handler builds a fresh MCP server for every request,
 * for both protocol eras (2026-07-28 and 2025-era), so any instance can
 * serve any request and nothing is lost when an instance stops.
 */
export class HttpTransport {
  private server: Server | undefined;
  private readonly handler: McpHttpHandler;
  private logger: Logger;
  private readonly allowedOrigins: Set<string>;
  private readonly maxRequestBodyBytes: number;
  private readonly allowedHosts: Set<string>;
  private readonly rateLimiter: RateLimiter | undefined;
  private readonly eraCounts: Record<RequestEra, number> = {
    modern: 0,
    legacy: 0,
    rejected: 0,
  };

  constructor(
    createMcpServer: McpServerFactory,
    logger: Logger,
    options: HttpTransportOptions = {}
  ) {
    this.logger = logger;
    this.allowedOrigins = new Set(options.allowedOrigins ?? []);
    this.maxRequestBodyBytes =
      options.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES;
    this.allowedHosts = new Set(
      (options.allowedHosts ?? []).map((host) => host.toLowerCase())
    );
    this.rateLimiter = options.rateLimiter;
    const countingFactory: McpServerFactory = (ctx) => {
      const store = eraStore.getStore();
      if (store) store.era = ctx.era;
      return createMcpServer(ctx);
    };
    this.handler = createMcpHandler(countingFactory, {
      legacy: "stateless",
      maxRequestBodySize: this.maxRequestBodyBytes,
      onerror: (error) => this.logger.debug(`MCP handler: ${error.message}`),
    });
  }

  /**
   * Authenticated MCP requests served since start, by protocol era. This is
   * what the legacy-retirement policy is measured with: see
   * docs/MIGRATION-2026-07-28.md.
   */
  get requestCounts(): Readonly<Record<RequestEra, number>> {
    return { ...this.eraCounts };
  }

  start(port = 3000, host = "localhost"): Promise<void> {
    this.server = createServer((req, res) => this.handle(req, res));

    return new Promise((resolve, reject) => {
      this.server?.listen(port, host, () => {
        this.logger.info(`HTTP transport listening on ${host}:${port}`);
        resolve();
      });
      this.server?.on("error", (error: Error) => {
        this.logger.error("HTTP Server error:", error);
        reject(error);
      });
    });
  }

  private setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin;
    if (origin && this.allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      `Content-Type, Accept, Authorization, ${MCP_HEADERS}`
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      `${MCP_HEADERS}, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After`
    );
  }

  private isAllowedHost(req: IncomingMessage): boolean {
    if (this.allowedHosts.size === 0) return true;
    const host = req.headers.host?.toLowerCase();
    if (!host) return false;
    const withoutPort = host.replace(/:\d+$/, "");
    return this.allowedHosts.has(host) || this.allowedHosts.has(withoutPort);
  }

  private static setRateLimitHeaders(
    res: ServerResponse,
    decision: { limit: number; remaining: number; reset: number }
  ): void {
    const resetSeconds = Math.max(
      0,
      Math.ceil((decision.reset - Date.now()) / 1000)
    );
    res.setHeader("RateLimit-Limit", String(decision.limit));
    res.setHeader(
      "RateLimit-Remaining",
      String(Math.max(0, decision.remaining))
    );
    res.setHeader("RateLimit-Reset", String(resetSeconds));
  }

  private async enforceRateLimit(
    res: ServerResponse,
    token: string
  ): Promise<boolean> {
    if (!this.rateLimiter) return true;

    let decision: {
      success: boolean;
      limit: number;
      remaining: number;
      reset: number;
    };
    try {
      decision = await this.rateLimiter.limit(rateLimitIdentifier(token));
    } catch (error) {
      this.logger.error("Rate limit check failed, allowing request:", error);
      return true;
    }

    HttpTransport.setRateLimitHeaders(res, decision);
    if (decision.success) return true;

    const retryAfter = Math.max(
      1,
      Math.ceil((decision.reset - Date.now()) / 1000)
    );
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
    });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32029,
          message: `Rate limit exceeded. Retry in ${retryAfter}s.`,
        },
        id: null,
      })
    );
    return false;
  }

  private static fail(
    res: ServerResponse,
    status: number,
    body: Record<string, unknown>,
    headers: Record<string, string> = {}
  ): void {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  }

  private async authorize(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<string | undefined> {
    const token = extractBearerToken(req);
    if (!token) {
      HttpTransport.fail(
        res,
        401,
        {
          error: "unauthorized",
          message:
            "Missing bearer token. Send Authorization: Bearer <frt_...> with every HTTP request.",
        },
        { "WWW-Authenticate": "Bearer" }
      );
      return;
    }

    if (!(await this.enforceRateLimit(res, token))) {
      return;
    }
    return token;
  }

  private onDispatchError(
    error: unknown,
    req: IncomingMessage,
    res: ServerResponse
  ): void {
    if (error instanceof PayloadTooLargeError) {
      this.logger.warn(`Rejected oversized request body: ${error.message}`);
      if (!res.headersSent) {
        HttpTransport.fail(res, 413, {
          error: "payload_too_large",
          message: error.message,
        });
      }
      req.destroy();
      return;
    }

    this.logger.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      HttpTransport.fail(res, 500, {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private handlePreMcp(req: IncomingMessage, res: ServerResponse): boolean {
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return true;
    }

    if (req.url !== "/health" && !this.isAllowedHost(req)) {
      this.logger.warn(
        `Rejected request with untrusted Host header: ${req.headers.host ?? "(none)"}`
      );
      HttpTransport.fail(res, 403, {
        error: "forbidden",
        message: "Host header is not allowed.",
      });
      return true;
    }

    if (
      (req.method === "GET" || req.method === "HEAD") &&
      req.url === "/health"
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return true;
    }

    return false;
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    this.setCorsHeaders(req, res);

    if (this.handlePreMcp(req, res)) return;

    const token = await this.authorize(req, res);
    if (!token) return;

    try {
      await this.dispatchMcp(req, res, token);
    } catch (error: unknown) {
      this.onDispatchError(error, req, res);
    }
  }

  private async dispatchMcp(
    req: IncomingMessage,
    res: ServerResponse,
    token: string
  ): Promise<void> {
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? await this.getRequestBody(req) : undefined;

    // Cancel the exchange when the client goes away before it completes.
    const abort = new AbortController();
    res.once("close", () => {
      if (!res.writableFinished) abort.abort();
    });

    const request = new Request(
      new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`),
      {
        method: req.method,
        headers: toWebHeaders(req),
        body,
        signal: abort.signal,
      }
    );

    const startedAt = Date.now();
    const served: { era?: "modern" | "legacy" } = {};
    const response = await eraStore.run(served, () =>
      runWithToken(token, () => this.handler.fetch(request))
    );

    // One line per request, so the share of legacy traffic can be measured
    // from the logs. No token, body or tool arguments are logged.
    const era: RequestEra = served.era ?? "rejected";
    this.eraCounts[era]++;
    this.logger.info(
      `mcp_request era=${era} status=${response.status} duration_ms=${Date.now() - startedAt}`
    );

    await writeWebResponse(response, res, abort.signal);
  }

  async stop(): Promise<void> {
    await this.handler.close();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info("HTTP Server stopped");
          resolve();
        });
        this.server.closeAllConnections();
      } else {
        resolve();
      }
    });
  }

  private getRequestBody(req: IncomingMessage): Promise<string> {
    const limit = this.maxRequestBodyBytes;

    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
      return Promise.reject(new PayloadTooLargeError(limit));
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let aborted = false;

      req.on("data", (chunk: Buffer) => {
        if (aborted) return;
        size += chunk.length;
        if (size > limit) {
          aborted = true;
          chunks.length = 0;
          req.pause();
          reject(new PayloadTooLargeError(limit));
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
      req.on("error", (error: Error) => {
        reject(error);
      });
    });
  }
}

function toWebHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      headers.append(name, entry);
    }
  }
  return headers;
}

/** Copy a web `Response` onto a Node response, streaming the body (SSE). */
async function writeWebResponse(
  response: Response,
  res: ServerResponse,
  signal: AbortSignal
): Promise<void> {
  for (const [name, value] of response.headers) {
    if (!TRANSPORT_OWNED_HEADERS.has(name.toLowerCase())) {
      res.setHeader(name, value);
    }
  }
  res.writeHead(response.status);

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  signal.addEventListener("abort", () => void reader.cancel(), { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}
