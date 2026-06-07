import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Logger } from "winston";
import { AIAdapter } from "@/adapters/ai-adapter.js";
import { BlobAdapter } from "@/adapters/blob-adapter.js";
import { FunctionsAdapter } from "@/adapters/functions-adapter.js";
import { GraphAdapter } from "@/adapters/graph-adapter.js";
import { PipelinesAdapter } from "@/adapters/pipelines-adapter.js";
import type { ServiceAdapter } from "@/adapters/types.js";
import type { ServerConfig } from "@/lib/server-config.js";
import { HealthMonitor } from "@/services/health-monitor.js";

export class FrontalMcpServer {
  private server: McpServer;
  private config: ServerConfig;
  private logger: Logger;
  private adapters: Map<string, ServiceAdapter> = new Map();
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

    await this.initializeAdapters();
    await this.registerComponents();

    await this.healthMonitor.initialize();
    this.healthMonitor.reportOperational();

    this.logger.info("Frontal MCP Server initialized successfully");
  }

  private async initializeAdapters(): Promise<void> {
    const adapterConfigs = [
      { name: "ai", Adapter: AIAdapter },
      { name: "blob", Adapter: BlobAdapter },
      { name: "functions", Adapter: FunctionsAdapter },
      { name: "graph", Adapter: GraphAdapter },
      { name: "pipelines", Adapter: PipelinesAdapter },
    ];

    for (const { name, Adapter } of adapterConfigs) {
      try {
        const adapter = new Adapter();
        await adapter.initialize(this.config, this.logger);
        this.adapters.set(name, adapter);
        this.logger.info(`Initialized ${name} adapter`);
      } catch (error) {
        this.logger.error(`Failed to initialize ${name} adapter:`, error);
        throw error;
      }
    }
  }

  private async registerComponents(): Promise<void> {
    for (const [name, adapter] of this.adapters) {
      try {
        adapter.registerTools(this.server);
        this.logger.debug(`Registered tools from ${name} adapter`);

        if (adapter.registerResources) {
          adapter.registerResources(this.server);
          this.logger.debug(`Registered resources from ${name} adapter`);
        }

        if (adapter.registerPrompts) {
          adapter.registerPrompts(this.server);
          this.logger.debug(`Registered prompts from ${name} adapter`);
        }
      } catch (error) {
        this.logger.error(
          `Failed to register components from ${name} adapter:`,
          error
        );
        throw error;
      }
    }
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
