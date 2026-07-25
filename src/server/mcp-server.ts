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
  readonly healthMonitor: HealthMonitor;

  constructor(config: ServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.server = new McpServer({
      name: "frontal-mcp-server",
      version: "1.0.0",
    });
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

  private registerAdapters(): void {
    const spec = loadSpecIndex();
    const client = new FrontalClient({
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      region: this.config.region,
      logger: this.logger,
    });

    const ctx: AdapterContext = {
      client,
      spec,
      logger: this.logger,
      config: this.config,
      // Per-request token (HTTP) wins; otherwise fall back to the env key.
      getToken: () => getRequestToken() ?? (this.config.apiKey || undefined),
    };

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
      `Frontal MCP Server ready: ${spec.count} operations available across tool sets [${this.config.toolsets.join(", ")}] (spec ${spec.version})`
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
