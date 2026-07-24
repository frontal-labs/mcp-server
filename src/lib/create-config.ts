import { env } from "@/config/env.js";
import {
  parseToolsets,
  type ServerConfig,
  serverConfigSchema,
} from "./server-config.js";

export function createConfig(
  overrides: Record<string, unknown> = {}
): ServerConfig {
  const defaults = {
    apiKey: env.FRONTAL_API_KEY,
    baseUrl: env.FRONTAL_BASE_URL,
    region: env.FRONTAL_REGION,
    toolsets: parseToolsets(env.FRONTAL_TOOLSETS),
    transport: { transport: "stdio" as const },
    auth: { type: "api-key" as const },
    incidentio: {
      apiKey: env.INCIDENTIO_API_KEY,
      statusPageId: env.INCIDENTIO_STATUS_PAGE_ID,
      statusPageUrl: env.INCIDENTIO_STATUS_PAGE_URL,
      componentId: env.INCIDENTIO_COMPONENT_ID,
    },
    logLevel: env.MCP_LOG_LEVEL,
    verbose: false,
  };
  return serverConfigSchema.parse({ ...defaults, ...overrides });
}
