import { env } from "./env.js";
import { serverConfigSchema, type ServerConfig } from "./server-config.js";

export function createConfig(
  overrides: Record<string, unknown> = {}
): ServerConfig {
  const defaults = {
    apiKey: env.FRONTAL_API_KEY,
    baseUrl: env.FRONTAL_BASE_URL,
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
