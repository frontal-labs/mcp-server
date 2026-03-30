import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "winston";
import type { ServerConfig } from "@/config/server-config.js";

export interface ServiceAdapter {
  name: string;
  initialize(config: ServerConfig, logger: Logger): Promise<void>;
  registerTools(server: McpServer): void;
  registerResources?(server: McpServer): void;
  registerPrompts?(server: McpServer): void;
}
