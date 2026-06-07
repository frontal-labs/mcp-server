import { z } from "zod";
import { env } from "./env.js";

export const transportConfigSchema = z.object({
  transport: z.enum(["stdio", "http"]),
  http: z
    .object({
      port: z.number().default(3000),
      host: z.string().default("localhost"),
    })
    .optional(),
});

export const authConfigSchema = z.object({
  type: z.enum(["api-key", "oauth"]).default("api-key"),
  apiKey: z.string().optional(),
});

export const incidentioConfigSchema = z.object({
  apiKey: z.string().default(""),
  statusPageId: z.string().default(""),
  statusPageUrl: z.string().default(""),
  componentId: z.string().default(""),
});

export const serverConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string(),
  transport: transportConfigSchema,
  auth: authConfigSchema,
  incidentio: incidentioConfigSchema,
  logLevel: z.enum(["error", "warn", "info", "debug"]),
  verbose: z.boolean().default(false),
});

export type TransportConfig = z.infer<typeof transportConfigSchema>;
export type AuthConfig = z.infer<typeof authConfigSchema>;
export type IncidentioConfig = z.infer<typeof incidentioConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;

export interface ConfigOptions {
  transport?: string;
  port?: number;
  host?: string;
  apiKey?: string;
  configPath?: string;
  verbose?: boolean;
  logLevel?: string;
}

export async function loadConfig(
  options: ConfigOptions
): Promise<ServerConfig> {
  const envConfig = {
    apiKey: options.apiKey || env.FRONTAL_API_KEY,
    baseUrl: env.FRONTAL_BASE_URL,
    transport: {
      transport: (options.transport as "stdio" | "http") || "stdio",
      http: options.port
        ? {
            port: options.port,
            host: options.host || "localhost",
          }
        : undefined,
    },
    auth: {
      type: "api-key" as const,
      apiKey: options.apiKey || env.FRONTAL_API_KEY || undefined,
    },
    incidentio: {
      apiKey: env.INCIDENTIO_API_KEY,
      statusPageId: env.INCIDENTIO_STATUS_PAGE_ID,
      statusPageUrl: env.INCIDENTIO_STATUS_PAGE_URL,
      componentId: env.INCIDENTIO_COMPONENT_ID,
    },
    logLevel:
      (options.logLevel as "error" | "warn" | "info" | "debug") ||
      env.MCP_LOG_LEVEL,
    verbose: options.verbose || false,
  };

  if (options.configPath) {
    try {
      const { readFile } = await import("node:fs/promises");
      const configData = JSON.parse(
        await readFile(options.configPath, "utf-8")
      );
      Object.assign(envConfig, configData);
    } catch (error) {
      throw new Error(
        `Failed to load config file: ${(error as Error).message}`
      );
    }
  }

  return serverConfigSchema.parse(envConfig);
}
