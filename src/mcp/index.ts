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
import {
  type McpRequestContext,
  McpServer,
} from "@modelcontextprotocol/server";
import {
  type StdioServerHandle,
  serveStdio,
} from "@modelcontextprotocol/server/stdio";
import type { Logger } from "winston";
import { FrontalClient } from "@/client.js";
import { getRequestToken } from "@/middlewares/auth.js";
import { HealthMonitor } from "@/services/health-monitor.js";
import { loadSpecIndex } from "@/spec/spec-index.js";
import { registerTaskHandlers } from "@/tasks/handlers.js";
import { enabledRunKinds, RUN_KINDS, type RunKind } from "@/tasks/run-kinds.js";
import { DataAdapter } from "@/tools/data-adapter.js";
import { EventsAdapter } from "@/tools/events-adapter.js";
import { GenericAdapter } from "@/tools/generic-adapter.js";
import { IntegrationsAdapter } from "@/tools/integrations-adapter.js";
import { OntologyAdapter } from "@/tools/ontology-adapter.js";
import type { AdapterContext, ServiceAdapter } from "@/tools/types.js";
import { WorkflowsAdapter } from "@/tools/workflows-adapter.js";
import type { ServerConfig } from "@/types/config.js";
import { VERSION } from "@/version.js";

const ALL_ADAPTERS: ServiceAdapter[] = [
  new GenericAdapter(),
  new OntologyAdapter(),
  new DataAdapter(),
  new WorkflowsAdapter(),
  new IntegrationsAdapter(),
  new EventsAdapter(),
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
  private readonly runKinds: readonly RunKind[];
  readonly healthMonitor: HealthMonitor;

  /**
   * @param runKinds The run kinds offered as tasks. Defaults to the
   * built-in registry; tests pass their own.
   */
  constructor(
    config: ServerConfig,
    logger: Logger,
    runKinds: readonly RunKind[] = RUN_KINDS
  ) {
    this.config = config;
    this.logger = logger;
    this.runKinds = runKinds;
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

      const spec = loadSpecIndex();
      this.adapterContext = {
        client,
        spec,
        logger: this.logger,
        config: this.config,
        getToken: () => getRequestToken() ?? (this.config.apiKey || undefined),
        runKinds: enabledRunKinds(this.runKinds, this.config.toolsets, spec),
      };
    }
    return this.adapterContext;
  }

  /**
   * Build a fresh, fully registered server. This is the factory behind both
   * transports, and it serves both protocol eras (2026-07-28 and 2025-era).
   * It is cheap: the client, spec index and config are shared.
   */
  createServer(request?: Pick<McpRequestContext, "era">): McpServer {
    return this.buildServer(this.getAdapterContext(), request?.era);
  }

  private buildServer(
    ctx?: AdapterContext,
    era?: McpRequestContext["era"]
  ): McpServer {
    const toolsets = this.config.toolsets.join(", ");
    const mode = this.config.readOnly
      ? " Read-only mode: tools that write are not available."
      : "";
    const server = new McpServer(
      {
        name: SERVER_NAME,
        title: "Frontal",
        version: VERSION,
        description: `Model Context Protocol server for the Frontal public API. Enabled tool sets: ${toolsets}.${mode}`,
        websiteUrl: DOCS_URL,
      },
      {
        instructions: `Tools for the Frontal public API (api.frontal.dev). Enabled tool sets: ${toolsets}.${mode} Documentation: ${DOCS_URL}`,
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
      // The Tasks extension exists only on 2026-07-28. A 2025-era client
      // gets the API response from a tool that starts a run, never a task.
      if (era === "modern" && ctx.runKinds && ctx.runKinds.size > 0) {
        registerTaskHandlers(server, ctx);
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
      `Frontal MCP Server ready: ${ctx.spec.count} operations available across tool sets [${this.config.toolsets.join(", ")}] (spec ${ctx.spec.version})${this.config.readOnly ? ", read-only mode" : ""}`
    );
  }

  /**
   * Serve MCP over this process's stdio. The client's opening message picks
   * the protocol era, and one server instance then serves the connection.
   */
  connectStdio(): Promise<void> {
    this.stdio = serveStdio((request) => this.createServer(request), {
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
