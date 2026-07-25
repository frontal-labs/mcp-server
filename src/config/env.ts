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
    MCP_LOG_LEVEL: process.env.MCP_LOG_LEVEL,
    INCIDENTIO_API_KEY: process.env.INCIDENTIO_API_KEY,
    INCIDENTIO_STATUS_PAGE_ID: process.env.INCIDENTIO_STATUS_PAGE_ID,
    INCIDENTIO_STATUS_PAGE_URL: process.env.INCIDENTIO_STATUS_PAGE_URL,
    INCIDENTIO_COMPONENT_ID: process.env.INCIDENTIO_COMPONENT_ID,
  },
  emptyStringAsUndefined: true,
});
