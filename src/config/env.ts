import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const booleanFromString = z
  .string()
  .optional()
  .transform((val) => val !== "false")
  .describe("Parsed as true unless explicitly set to 'false'");

export const env = createEnv({
  server: {
    /** Frontal API key for authenticating requests to the Frontal platform */
    FRONTAL_API_KEY: z
      .string()
      .optional()
      .default("")
      .describe("Frontal API key for authentication"),

    /** Base URL for the Frontal API */
    FRONTAL_BASE_URL: z
      .string()
      .url()
      .optional()
      .default("https://api.frontal.dev/v1")
      .describe("Frontal API base URL"),

    /** Log level for the MCP server */
    MCP_LOG_LEVEL: z
      .enum(["error", "warn", "info", "debug"])
      .optional()
      .default("info")
      .describe("Server log level"),

    /** Enable or disable the AI service (text generation, image generation, embeddings) */
    ENABLE_AI: booleanFromString,

    /** Enable or disable the Blob storage service */
    ENABLE_BLOB: booleanFromString,

    /** Enable or disable the Functions service (serverless function execution) */
    ENABLE_FUNCTIONS: booleanFromString,

    /** Enable or disable the Graph database service */
    ENABLE_GRAPH: booleanFromString,

    /** Enable or disable the Pipelines service */
    ENABLE_PIPELINES: booleanFromString,

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
      .string()
      .url()
      .default("https://frontal-status.com")
      .describe("Public URL of the incident.io status page"),

    /** incident.io component ID representing this server (optional, auto-detected if not set) */
    INCIDENTIO_COMPONENT_ID: z
      .string()
      .optional()
      .default("")
      .describe("incident.io component ID for this server"),

    /** Enable or disable the incident.io integration */
    ENABLE_INCIDENTIO: booleanFromString,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
