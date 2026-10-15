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
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
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

const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_SESSION_SWEEP_INTERVAL_MS = 60 * 1000;
const DEFAULT_MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_SESSIONS = 256;

class PayloadTooLargeError extends Error {
  constructor(limit: number) {
    super(`Request body exceeds the ${limit} byte limit`);
    this.name = "PayloadTooLargeError";
  }
}

export interface HttpTransportOptions {
  allowedOrigins?: string[];
  sessionIdleTimeoutMs?: number;
  sessionSweepIntervalMs?: number;
  maxRequestBodyBytes?: number;
  maxSessions?: number;
  allowedHosts?: string[];
  rateLimiter?: RateLimiter;
}

export class HttpTransport {
  private server: Server | undefined;
  private readonly sessions = new Map<
    string,
    {
      transport: StreamableHTTPServerTransport;
      mcpServer: McpServer;
      lastSeen: number;
    }
  >();
  private logger: Logger;
  private readonly allowedOrigins: Set<string>;
  private readonly sessionIdleTimeoutMs: number;
  private readonly sessionSweepIntervalMs: number;
  private readonly maxRequestBodyBytes: number;
  private readonly maxSessions: number;
  private readonly allowedHosts: Set<string>;
  private readonly rateLimiter: RateLimiter | undefined;
  private sweepTimer: NodeJS.Timeout | undefined;

  constructor(
    private createMcpServer: () => McpServer,
    logger: Logger,
    options: HttpTransportOptions = {}
  ) {
    this.logger = logger;
    this.allowedOrigins = new Set(options.allowedOrigins ?? []);
    this.sessionIdleTimeoutMs =
      options.sessionIdleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS;
    this.sessionSweepIntervalMs =
      options.sessionSweepIntervalMs ?? DEFAULT_SESSION_SWEEP_INTERVAL_MS;
    this.maxRequestBodyBytes =
      options.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.allowedHosts = new Set(
      (options.allowedHosts ?? []).map((host) => host.toLowerCase())
    );
    this.rateLimiter = options.rateLimiter;
  }

  private sweepIdleSessions(): void {
    const cutoff = Date.now() - this.sessionIdleTimeoutMs;
    for (const [id, session] of this.sessions) {
      if (session.lastSeen <= cutoff) {
        this.logger.info(`Closing idle MCP session: ${id}`);
        void session.transport.close();
      }
    }
  }

  async start(port = 3000, host = "localhost"): Promise<void> {
    this.server = createServer((req, res) => this.handle(req, res));

    this.sweepTimer = setInterval(
      () => this.sweepIdleSessions(),
      this.sessionSweepIntervalMs
    );
    this.sweepTimer.unref?.();

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
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Mcp-Session-Id"
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Mcp-Session-Id, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After"
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

  private async openSession(): Promise<StreamableHTTPServerTransport> {
    const mcpServer = this.createMcpServer();
    let sessionId: string | undefined;

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id: string) => {
        sessionId = id;
        this.sessions.set(id, { transport, mcpServer, lastSeen: Date.now() });
        this.logger.debug(
          `MCP session opened: ${id} (${this.sessions.size} active)`
        );
      },
    });

    transport.onclose = () => {
      if (sessionId && this.sessions.delete(sessionId)) {
        this.logger.debug(
          `MCP session closed: ${sessionId} (${this.sessions.size} active)`
        );
      }
    };

    await mcpServer.connect(transport);
    return transport;
  }

  private async dispatchMcp(
    req: IncomingMessage,
    res: ServerResponse,
    token: string
  ): Promise<void> {
    const body =
      req.method === "GET" ? undefined : await this.getRequestBody(req);
    const parsedBody = body ? JSON.parse(body) : undefined;

    const sessionId = req.headers["mcp-session-id"];
    const existing =
      typeof sessionId === "string" ? this.sessions.get(sessionId) : undefined;

    let transport: StreamableHTTPServerTransport;
    if (existing) {
      existing.lastSeen = Date.now();
      transport = existing.transport;
    } else if (!sessionId && isInitializeRequest(parsedBody)) {
      if (this.sessions.size >= this.maxSessions) {
        this.logger.warn(
          `Refusing new MCP session: ${this.sessions.size} sessions open (limit ${this.maxSessions})`
        );
        res.writeHead(503, {
          "Content-Type": "application/json",
          "Retry-After": "60",
        });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32002,
              message:
                "Server is at its session limit. Retry shortly or close idle sessions with DELETE.",
            },
            id: null,
          })
        );
        return;
      }
      transport = await this.openSession();
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message:
              "Unknown or expired Mcp-Session-Id. Send an initialize request to start a new session.",
          },
          id: null,
        })
      );
      return;
    }

    await runWithToken(token, () =>
      transport.handleRequest(req, res, parsedBody)
    );
  }

  async stop(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }

    const open = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.allSettled(open.map(({ transport }) => transport.close()));

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info("HTTP Server stopped");
          resolve();
        });
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
