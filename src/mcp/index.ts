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
import { McpServer } from "@modelcontextprotocol/server";
import {
  type StdioServerHandle,
  serveStdio,
} from "@modelcontextprotocol/server/stdio";
import type { Logger } from "winston";
import { FrontalClient } from "@/client.js";
import { getRequestToken } from "@/middlewares/auth.js";
import { HealthMonitor } from "@/services/health-monitor.js";
import { loadSpecIndex } from "@/spec/spec-index.js";
import { DataAdapter } from "@/tools/data-adapter.js";
import { GenericAdapter } from "@/tools/generic-adapter.js";
import { OntologyAdapter } from "@/tools/ontology-adapter.js";
import type { AdapterContext, ServiceAdapter } from "@/tools/types.js";
import type { ServerConfig } from "@/types/config.js";
import { VERSION } from "@/version.js";

const ALL_ADAPTERS: ServiceAdapter[] = [
  new GenericAdapter(),
  new OntologyAdapter(),
  new DataAdapter(),
];

export const SERVER_NAME = "frontal-mcp-server";
export const DOCS_URL = "https://docs.frontal.dev/";

/**
 * How long a client may cache `tools/list` and `server/discover` results.
 * Both change only when the server is redeployed or reconfigured.
 */
const LIST_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * The tool list is the same for every caller today, but it stays `private`:
 * every HTTP request is authenticated, and later phases gate tools by the
 * caller's scopes, so a shared cache must never serve one caller's list to
 * another.
 */
const LIST_CACHE_HINT = {
  ttlMs: LIST_CACHE_TTL_MS,
  cacheScope: "private",
} as const;

export class FrontalMcpServer {
  private server: McpServer;
  private config: ServerConfig;
  private logger: Logger;
  private adapterContext: AdapterContext | undefined;
  private stdio: StdioServerHandle | undefined;
  readonly healthMonitor: HealthMonitor;

  constructor(config: ServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.server = this.buildServer();
    this.healthMonitor = new HealthMonitor(config.incidentio, logger);
  }

  /**
   * A standalone instance with the enabled tools registered, for in-process
   * use. The transports do not serve this instance: they build a fresh one
   * per connection (stdio) or per request (HTTP) with {@link createServer}.
   */
  get mcpServerInstance(): McpServer {
    return this.server;
  }

  async initialize(): Promise<void> {
    this.logger.info("Initializing Frontal MCP Server...");

    this.registerAdapters();

    await this.healthMonitor.initialize();
    this.healthMonitor.reportOperational();

    this.logger.info("Frontal MCP Server initialized successfully");
  }

  private getAdapterContext(): AdapterContext {
    if (!this.adapterContext) {
      const client = new FrontalClient({
        baseUrl: this.config.baseUrl,
        apiKey: this.config.apiKey,
        region: this.config.region,
        logger: this.logger,
      });

      this.adapterContext = {
        client,
        spec: loadSpecIndex(),
        logger: this.logger,
        config: this.config,
        getToken: () => getRequestToken() ?? (this.config.apiKey || undefined),
      };
    }
    return this.adapterContext;
  }

  /**
   * Build a fresh, fully registered server. This is the factory behind both
   * transports, and it serves both protocol eras (2026-07-28 and 2025-era).
   * It is cheap: the client, spec index and config are shared.
   */
  createServer(): McpServer {
    return this.buildServer(this.getAdapterContext());
  }

  private buildServer(ctx?: AdapterContext): McpServer {
    const toolsets = this.config.toolsets.join(", ");
    const server = new McpServer(
      {
        name: SERVER_NAME,
        title: "Frontal",
        version: VERSION,
        description: `Model Context Protocol server for the Frontal public API. Enabled tool sets: ${toolsets}.`,
        websiteUrl: DOCS_URL,
      },
      {
        instructions: `Tools for the Frontal public API (api.frontal.dev). Enabled tool sets: ${toolsets}. Documentation: ${DOCS_URL}`,
        cacheHints: {
          "tools/list": LIST_CACHE_HINT,
          "server/discover": LIST_CACHE_HINT,
        },
      }
    );
    if (ctx) {
      const enabled = new Set(this.config.toolsets);
      for (const adapter of ALL_ADAPTERS) {
        if (enabled.has(adapter.toolset)) {
          adapter.register(server, ctx);
        }
      }
    }
    return server;
  }

  private registerAdapters(): void {
    const ctx = this.getAdapterContext();
    const enabled = new Set(this.config.toolsets);
    for (const adapter of ALL_ADAPTERS) {
      if (!enabled.has(adapter.toolset)) continue;
      adapter.register(this.server, ctx);
      this.logger.info(`Registered ${adapter.name} tools`);
    }

    if (!this.config.apiKey) {
      this.logger.warn(
        "No FRONTAL_API_KEY set — tools will require a per-request Authorization header (HTTP transport) or return an auth error."
      );
    }
    this.logger.info(
      `Frontal MCP Server ready: ${ctx.spec.count} operations available across tool sets [${this.config.toolsets.join(", ")}] (spec ${ctx.spec.version})`
    );
  }

  /**
   * Serve MCP over this process's stdio. The client's opening message picks
   * the protocol era, and one server instance then serves the connection.
   */
  connectStdio(): Promise<void> {
    this.stdio = serveStdio(() => this.createServer(), {
      onerror: (error) => this.logger.error("stdio transport error:", error),
    });
    this.logger.info("Connected via stdio transport");
    return Promise.resolve();
  }

  async close(): Promise<void> {
    this.logger.info("Shutting down Frontal MCP Server...");
    await this.stdio?.close();
    this.stdio = undefined;
    await this.server.close();
    this.logger.info("Frontal MCP Server shut down");
  }
}
