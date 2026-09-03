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
import { runWithToken } from "./auth-context.js";

/** Pull a bearer token out of the inbound Authorization header, if present. */
function extractBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header) {
    return;
  }
  const trimmed = header.trim();
  // Split on the first whitespace run without a backtracking-prone regex.
  const separator = trimmed.search(/\s/);
  if (separator === -1) {
    return;
  }
  if (trimmed.slice(0, separator).toLowerCase() !== "bearer") {
    return;
  }
  const token = trimmed.slice(separator + 1).trim();
  return token || undefined;
}

/** Evict sessions after 30 minutes without a request. */
const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** Look for idle sessions once a minute. */
const DEFAULT_SESSION_SWEEP_INTERVAL_MS = 60 * 1000;
/**
 * Refuse request bodies larger than 4 MiB.
 *
 * MCP requests are JSON-RPC frames; legitimate ones are far smaller. The
 * body is buffered in memory before the session is even known, so without a
 * cap a single request can exhaust the process.
 */
const DEFAULT_MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;
/**
 * Cap concurrent sessions.
 *
 * Each session holds its own McpServer with every tool registered, which
 * measures at roughly 0.6 MB. Left unbounded, a caller that opens sessions
 * and walks away exhausts the process well before the idle sweeper reclaims
 * them. 256 sessions is about 160 MB, which fits the documented 512 MB
 * deployment with room to spare.
 */
const DEFAULT_MAX_SESSIONS = 256;

/** Raised when a request body exceeds the configured limit. */
class PayloadTooLargeError extends Error {
  constructor(limit: number) {
    super(`Request body exceeds the ${limit} byte limit`);
    this.name = "PayloadTooLargeError";
  }
}

export interface EnhancedHttpTransportOptions {
  /**
   * Browser origins allowed by CORS. Empty (the default) trusts no origin:
   * `Access-Control-Allow-Origin` is only echoed for a listed origin, never
   * sent as `*`.
   */
  allowedOrigins?: string[];
  /**
   * How long a session may go without a request before it is closed.
   * Well-behaved clients send `DELETE` when they disconnect, but a client that
   * crashes or loses the network never does — without this, those sessions
   * would accumulate for the life of the process.
   */
  sessionIdleTimeoutMs?: number;
  /** How often to scan for idle sessions. */
  sessionSweepIntervalMs?: number;
  /**
   * Largest request body accepted, in bytes. Bodies are buffered in memory
   * before the session is resolved, so this bounds what a single caller can
   * make the process allocate.
   */
  maxRequestBodyBytes?: number;
  /**
   * Largest number of concurrent sessions. Once reached, new initialize
   * requests are refused with 503 rather than letting the process run out
   * of memory; existing sessions keep working.
   */
  maxSessions?: number;
}

export class EnhancedHttpTransport {
  private server: Server | undefined;
  /**
   * Live MCP sessions, keyed by `Mcp-Session-Id`.
   *
   * A `StreamableHTTPServerTransport` holds the state of a single session, and
   * an `McpServer` binds to exactly one transport, so both are created per
   * session rather than shared across the process.
   */
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
  private sweepTimer: NodeJS.Timeout | undefined;

  constructor(
    private createMcpServer: () => McpServer,
    logger: Logger,
    options: EnhancedHttpTransportOptions = {}
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
  }

  /** Close sessions that have gone quiet for longer than the idle timeout. */
  private sweepIdleSessions(): void {
    const cutoff = Date.now() - this.sessionIdleTimeoutMs;
    for (const [id, session] of this.sessions) {
      if (session.lastSeen <= cutoff) {
        this.logger.info(`Closing idle MCP session: ${id}`);
        // `onclose` removes it from the map.
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
    // Never hold the process open just to run the sweeper.
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
    // Never reply with a wildcard: only echo an origin that is explicitly
    // trusted. Unlisted (or absent) origins get no ACAO header, so browsers
    // block the cross-origin response.
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
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    this.setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // HEAD is accepted alongside GET: container and load-balancer probes
    // commonly send HEAD (`wget --spider` does), and falling through to the
    // MCP path would answer an unauthenticated probe with 401 and mark an
    // otherwise healthy server as failing. Node omits the body for HEAD.
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      req.url === "/health"
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // HTTP is multi-tenant: every MCP request must carry its own bearer token.
    // Reject unauthenticated requests up front so they can never reach the
    // adapters and borrow the server's stdio-only FRONTAL_API_KEY fallback.
    const token = extractBearerToken(req);
    if (!token) {
      res.writeHead(401, {
        "Content-Type": "application/json",
        "WWW-Authenticate": "Bearer",
      });
      res.end(
        JSON.stringify({
          error: "unauthorized",
          message:
            "Missing bearer token. Send Authorization: Bearer <frt_...> with every HTTP request.",
        })
      );
      return;
    }

    try {
      await this.dispatchMcp(req, res, token);
    } catch (error: unknown) {
      if (error instanceof PayloadTooLargeError) {
        this.logger.warn(`Rejected oversized request body: ${error.message}`);
        if (!res.headersSent) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "payload_too_large",
              message: error.message,
            })
          );
        }
        // Hang up on a sender still streaming a body we refused to read.
        req.destroy();
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error", message }));
      }
    }
  }

  /** Create, connect and register a transport for a brand-new session. */
  private async openSession(): Promise<StreamableHTTPServerTransport> {
    const mcpServer = this.createMcpServer();
    // Captured on initialize so teardown does not have to read `sessionId`
    // back off an already-closed transport.
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

    // Drop the session when the client disconnects or sends DELETE, so a
    // long-lived process does not accumulate dead sessions. Connecting the
    // server chains this handler ahead of the SDK's own teardown, which
    // closes the McpServer — doing that here too would recurse.
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
      // Unknown or expired session: let the client know it must re-initialize
      // rather than silently handing it a fresh, empty session.
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

    // Bind the caller's bearer token to this request's async context so tool
    // handlers use it (multi-tenant hosting).
    await runWithToken(token, () =>
      transport.handleRequest(req, res, parsedBody)
    );
  }

  async stop(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }

    // Tear down live sessions before closing the listener so in-flight SSE
    // streams are ended cleanly.
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

    // Reject on the declared length before reading a single byte when the
    // client is honest about the size.
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
      return Promise.reject(new PayloadTooLargeError(limit));
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let aborted = false;

      req.on("data", (chunk: Buffer) => {
        if (aborted) {
          return;
        }
        size += chunk.length;
        if (size > limit) {
          // Stop buffering: a chunked sender can otherwise ignore the
          // content-length check above and stream without bound. Pause
          // rather than destroy so the 413 can still be written; the
          // handler destroys the request once the response is out.
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
