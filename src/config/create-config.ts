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
    services: {
      ai: env.ENABLE_AI,
      blob: env.ENABLE_BLOB,
      functions: env.ENABLE_FUNCTIONS,
      graph: env.ENABLE_GRAPH,
      pipelines: env.ENABLE_PIPELINES,
    },
    logLevel: env.MCP_LOG_LEVEL,
    verbose: false,
  };
  return serverConfigSchema.parse({ ...defaults, ...overrides });
}
