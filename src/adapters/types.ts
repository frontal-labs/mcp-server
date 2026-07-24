import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "winston";
import type { FrontalClient } from "@/clients/frontal-client.js";
import type { ServerConfig, Toolset } from "@/lib/server-config.js";
import type { SpecIndex } from "@/spec/spec-index.js";

/** Shared services handed to every adapter at registration time. */
export interface AdapterContext {
  client: FrontalClient;
  spec: SpecIndex;
  logger: Logger;
  config: ServerConfig;
  /**
   * Resolve the bearer token for the current call: the per-request token
   * (HTTP transport) if present, otherwise the configured API key.
   */
  getToken(): string | undefined;
}

/** A registrable group of MCP tools backed by the Frontal API. */
export interface ServiceAdapter {
  name: string;
  /** Which tool set this adapter belongs to (gated by `FRONTAL_TOOLSETS`). */
  toolset: Toolset;
  register(server: McpServer, ctx: AdapterContext): void;
}
