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
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    /** Frontal API key for authenticating requests to the Frontal platform */
    FRONTAL_API_KEY: z
      .string()
      .optional()
      .default("")
      .describe("Frontal API key for authentication"),

    /**
     * Base URL for the Frontal public API. Bare host — versioned paths already
     * include the `/v1/` prefix (e.g. `https://api.frontal.dev/v1/data/...`).
     * Regional hosts (`https://us.api.frontal.dev`) are also valid.
     */
    FRONTAL_BASE_URL: z
      .url()
      .optional()
      .default("https://api.frontal.dev")
      .describe("Frontal public API base URL (bare host, no /v1 suffix)"),

    /**
     * Optional region pin. Sent as the `x-frontal-region` header on every
     * request. Unknown regions are rejected by the edge with HTTP 409.
     * Examples: iad, lhr, fra, sin.
     */
    FRONTAL_REGION: z
      .string()
      .optional()
      .default("")
      .describe("Optional region pin (x-frontal-region header)"),

    /**
     * Comma-separated list of tool sets to register. `generic` exposes the
     * spec-driven meta-tools; `ontology` and `data` expose curated tools.
     */
    FRONTAL_TOOLSETS: z
      .string()
      .optional()
      .default("generic,ontology,data")
      .describe("Comma-separated tool sets to enable"),

    /**
     * Comma-separated list of browser origins allowed to make cross-origin
     * requests to the HTTP transport. Empty by default: no origin is trusted,
     * so `Access-Control-Allow-Origin` is only echoed for a listed origin
     * (never `*`). HTTP callers still authenticate with a per-request bearer
     * token regardless of CORS.
     */
    FRONTAL_HTTP_ALLOWED_ORIGINS: z
      .string()
      .optional()
      .default("")
      .describe("Comma-separated CORS allowlist for the HTTP transport"),

    /**
     * Largest MCP request body accepted by the HTTP transport, in bytes.
     * Bodies are buffered before the session is resolved, so this bounds
     * what a single caller can make the process allocate.
     */
    FRONTAL_HTTP_MAX_BODY_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe("Max HTTP request body size in bytes (default 4 MiB)"),

    /**
     * Largest number of concurrent MCP sessions. Each session holds its own
     * server instance, so this is the main memory dial: raise it on a larger
     * VM, lower it on a smaller one.
     */
    FRONTAL_HTTP_MAX_SESSIONS: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe("Max concurrent MCP sessions (default 256)"),

    /**
     * Comma-separated hosts accepted in the `Host` header of MCP requests.
     * Empty by default, which disables host checking. Set it for any
     * deployment reachable from a browser: it is what blocks DNS rebinding,
     * where an attacker resolves a hostname they control to this server so a
     * victim's browser treats the response as same-origin.
     */
    FRONTAL_HTTP_ALLOWED_HOSTS: z
      .string()
      .optional()
      .default("")
      .describe("Comma-separated Host allowlist for the HTTP transport"),

    /** Log level for the MCP server */
    MCP_LOG_LEVEL: z
      .enum(["error", "warn", "info", "debug"])
      .optional()
      .default("info")
      .describe("Server log level"),

    /** incident.io API key for status page integration */
    INCIDENTIO_API_KEY: z
      .string()
      .optional()
      .default("")
      .describe("incident.io API key for status page management"),

    /** incident.io status page ID (optional, auto-detected if not set) */
    INCIDENTIO_STATUS_PAGE_ID: z
      .string()
      .optional()
      .default("")
      .describe("incident.io status page ID"),

    /** Public URL of the incident.io status page (e.g. https://frontal-status.com) */
    INCIDENTIO_STATUS_PAGE_URL: z
      .url()
      .default("https://frontal-status.com")
      .describe("Public URL of the incident.io status page"),

    /** incident.io component ID representing this server (optional, auto-detected if not set) */
    INCIDENTIO_COMPONENT_ID: z
      .string()
      .optional()
      .default("")
      .describe("incident.io component ID for this server"),
  },
  runtimeEnv: {
    FRONTAL_API_KEY: process.env.FRONTAL_API_KEY,
    FRONTAL_BASE_URL: process.env.FRONTAL_BASE_URL,
    FRONTAL_REGION: process.env.FRONTAL_REGION,
    FRONTAL_TOOLSETS: process.env.FRONTAL_TOOLSETS,
    FRONTAL_HTTP_ALLOWED_ORIGINS: process.env.FRONTAL_HTTP_ALLOWED_ORIGINS,
    FRONTAL_HTTP_MAX_BODY_BYTES: process.env.FRONTAL_HTTP_MAX_BODY_BYTES,
    FRONTAL_HTTP_MAX_SESSIONS: process.env.FRONTAL_HTTP_MAX_SESSIONS,
    FRONTAL_HTTP_ALLOWED_HOSTS: process.env.FRONTAL_HTTP_ALLOWED_HOSTS,
    MCP_LOG_LEVEL: process.env.MCP_LOG_LEVEL,
    INCIDENTIO_API_KEY: process.env.INCIDENTIO_API_KEY,
    INCIDENTIO_STATUS_PAGE_ID: process.env.INCIDENTIO_STATUS_PAGE_ID,
    INCIDENTIO_STATUS_PAGE_URL: process.env.INCIDENTIO_STATUS_PAGE_URL,
    INCIDENTIO_COMPONENT_ID: process.env.INCIDENTIO_COMPONENT_ID,
  },
  emptyStringAsUndefined: true,
});
