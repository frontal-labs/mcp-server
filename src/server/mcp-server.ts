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
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Logger } from "winston";
import { DataAdapter } from "@/adapters/data-adapter.js";
import { GenericAdapter } from "@/adapters/generic-adapter.js";
import { OntologyAdapter } from "@/adapters/ontology-adapter.js";
import type { AdapterContext, ServiceAdapter } from "@/adapters/types.js";
import { FrontalClient } from "@/clients/frontal-client.js";
import type { ServerConfig } from "@/lib/server-config.js";
import { HealthMonitor } from "@/services/health-monitor.js";
import { loadSpecIndex } from "@/spec/spec-index.js";
import { VERSION } from "@/version.js";
import { getRequestToken } from "./auth-context.js";

const ALL_ADAPTERS: ServiceAdapter[] = [
  new GenericAdapter(),
  new OntologyAdapter(),
  new DataAdapter(),
];

export class FrontalMcpServer {
  private server: McpServer;
  private config: ServerConfig;
  private logger: Logger;
  /**
   * Adapter context shared by every McpServer this instance creates. The spec
   * index and HTTP client are stateless with respect to the caller — the
   * per-request bearer token is resolved through `getToken` from async
   * context — so they are built once and reused across sessions.
   */
  private adapterContext: AdapterContext | undefined;
  readonly healthMonitor: HealthMonitor;

  constructor(config: ServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.server = this.buildServer();
    this.healthMonitor = new HealthMonitor(config.incidentio, logger);
  }

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
        // Per-request token (HTTP) wins; otherwise fall back to the env key.
        getToken: () => getRequestToken() ?? (this.config.apiKey || undefined),
      };
    }
    return this.adapterContext;
  }

  /**
   * Build a fresh McpServer with the enabled tool sets registered.
   *
   * An McpServer binds to exactly one transport, so the HTTP transport needs a
   * separate instance per session. This is quiet by design — `initialize()`
   * logs the registration summary once rather than on every new session.
   */
  createServer(): McpServer {
    return this.buildServer(this.getAdapterContext());
  }

  private buildServer(ctx?: AdapterContext): McpServer {
    const server = new McpServer({
      name: "frontal-mcp-server",
      version: VERSION,
    });
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
      if (!enabled.has(adapter.toolset)) {
        continue;
      }
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

  async connectStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info("Connected via stdio transport");
  }

  async close(): Promise<void> {
    this.logger.info("Shutting down Frontal MCP Server...");
    await this.server.close();
    this.logger.info("Frontal MCP Server shut down");
  }
}
