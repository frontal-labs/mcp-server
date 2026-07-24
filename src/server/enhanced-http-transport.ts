import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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

export interface EnhancedHttpTransportOptions {
  /**
   * Browser origins allowed by CORS. Empty (the default) trusts no origin:
   * `Access-Control-Allow-Origin` is only echoed for a listed origin, never
   * sent as `*`.
   */
  allowedOrigins?: string[];
}

export class EnhancedHttpTransport {
  private server: Server | undefined;
  private transport: StreamableHTTPServerTransport;
  private logger: Logger;
  private readonly allowedOrigins: Set<string>;

  constructor(
    private mcpServer: McpServer,
    logger: Logger,
    options: EnhancedHttpTransportOptions = {}
  ) {
    this.logger = logger;
    this.allowedOrigins = new Set(options.allowedOrigins ?? []);
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
  }

  async start(port = 3000, host = "localhost"): Promise<void> {
    await this.mcpServer.connect(this.transport);

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

    if (req.method === "GET" && req.url === "/health") {
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
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error", message }));
      }
    }
  }

  private async dispatchMcp(
    req: IncomingMessage,
    res: ServerResponse,
    token: string
  ): Promise<void> {
    const body =
      req.method === "GET" ? undefined : await this.getRequestBody(req);
    const parsedBody = body ? JSON.parse(body) : undefined;

    // Bind the caller's bearer token to this request's async context so tool
    // handlers use it (multi-tenant hosting).
    await runWithToken(token, () =>
      this.transport.handleRequest(req, res, parsedBody)
    );
  }

  async stop(): Promise<void> {
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

  private async getRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        resolve(body);
      });
      req.on("error", (error: Error) => {
        reject(error);
      });
    });
  }
}
