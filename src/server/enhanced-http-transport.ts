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

export class EnhancedHttpTransport {
  private server: Server | undefined;
  private transport: StreamableHTTPServerTransport;
  private logger: Logger;

  constructor(
    private mcpServer: McpServer,
    logger: Logger
  ) {
    this.logger = logger;
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
  }

  async start(port = 3000, host = "localhost"): Promise<void> {
    await this.mcpServer.connect(this.transport);

    this.server = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, DELETE, OPTIONS"
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, Mcp-Session-Id"
        );

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

        try {
          const body =
            req.method === "GET" ? undefined : await this.getRequestBody(req);
          const parsedBody = body ? JSON.parse(body) : undefined;

          await this.transport.handleRequest(req, res, parsedBody);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          this.logger.error("Error handling MCP request:", error);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({ error: "Internal server error", message })
            );
          }
        }
      }
    );

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
