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
import { z } from "zod";
import { env } from "@/config/env.js";
import { ConfigError } from "./error.js";

export const transportConfigSchema = z.object({
  transport: z.enum(["stdio", "http"]),
  http: z
    .object({
      port: z.number().default(3000),
      host: z.string().default("localhost"),
      /** Browser origins allowed by CORS; empty means no cross-origin trust. */
      allowedOrigins: z.array(z.string()).default([]),
      /** Max request body in bytes; undefined uses the transport default. */
      maxRequestBodyBytes: z.number().int().positive().optional(),
      /** Max concurrent sessions; undefined uses the transport default. */
      maxSessions: z.number().int().positive().optional(),
      /** Hosts accepted in the Host header; empty disables the check. */
      allowedHosts: z.array(z.string()).default([]),
    })
    .optional(),
});

export const authConfigSchema = z.object({
  type: z.enum(["api-key", "oauth"]).default("api-key"),
  apiKey: z.string().optional(),
});

export const incidentioConfigSchema = z.object({
  apiKey: z.string(),
  statusPageId: z.string(),
  statusPageUrl: z.url().default(env.INCIDENTIO_STATUS_PAGE_URL),
  componentId: z.string().default(env.INCIDENTIO_COMPONENT_ID),
});

/** Known tool sets that can be registered. */
export const TOOLSETS = ["generic", "ontology", "data"] as const;
export const toolsetSchema = z.enum(TOOLSETS);

/**
 * Parse a comma-separated tool set list into a validated, de-duped array.
 *
 * With no nonempty values this defaults to every tool set. Any invalid entry
 * (e.g. a typo like `ontolgy`) is a hard error: this is a gating knob, so we
 * fail fast rather than silently enabling everything.
 */
export function parseToolsets(raw: string): Toolset[] {
  const parsed = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  // Default to everything only when nothing was provided at all.
  if (parsed.length === 0) {
    return [...TOOLSETS];
  }
  const seen = new Set<Toolset>();
  const invalid: string[] = [];
  for (const entry of parsed) {
    const result = toolsetSchema.safeParse(entry);
    if (result.success) {
      seen.add(result.data);
    } else {
      invalid.push(entry);
    }
  }
  if (invalid.length > 0) {
    throw new ConfigError(
      `Invalid FRONTAL_TOOLSETS ${invalid.length === 1 ? "entry" : "entries"}: ${invalid.join(", ")}. Valid tool sets are: ${TOOLSETS.join(", ")}.`
    );
  }
  return [...seen];
}

/** Parse a comma-separated allowlist into a trimmed, de-duped array. */
export function parseCsvList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    ),
  ];
}

export const serverConfigSchema = z.object({
  apiKey: z.string().default(env.FRONTAL_API_KEY),
  baseUrl: z.string().default(env.FRONTAL_BASE_URL),
  /** Optional region pin sent as the `x-frontal-region` header. */
  region: z.string().default(env.FRONTAL_REGION),
  /** Tool sets to register on startup. */
  toolsets: z.array(toolsetSchema).default([...TOOLSETS]),
  transport: transportConfigSchema,
  auth: authConfigSchema,
  incidentio: incidentioConfigSchema,
  logLevel: z.enum(["error", "warn", "info", "debug"]),
  verbose: z.boolean().default(false),
});

export type Toolset = z.infer<typeof toolsetSchema>;
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
    region: env.FRONTAL_REGION,
    toolsets: parseToolsets(env.FRONTAL_TOOLSETS),
    transport: {
      transport: (options.transport as "stdio" | "http") || "stdio",
      http: options.port
        ? {
            port: options.port,
            host: options.host || "localhost",
            allowedOrigins: parseCsvList(env.FRONTAL_HTTP_ALLOWED_ORIGINS),
            maxRequestBodyBytes: env.FRONTAL_HTTP_MAX_BODY_BYTES,
            maxSessions: env.FRONTAL_HTTP_MAX_SESSIONS,
            allowedHosts: parseCsvList(env.FRONTAL_HTTP_ALLOWED_HOSTS),
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
      throw new ConfigError(
        `Failed to load config file: ${(error as Error).message}`,
        { path: options.configPath }
      );
    }
  }

  return serverConfigSchema.parse(envConfig);
}
