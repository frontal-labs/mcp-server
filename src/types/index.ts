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

/**
 * Centralized types barrel export.
 *
 * All shared types, interfaces, and type definitions live here.
 * Import from "@/types" instead of scattered locations.
 * This module ONLY exports types - no runtime values to avoid circular imports.
 */

// MCP server types
export type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export type { Logger } from "winston";
// Incident.io types
export type {
  IncidentioComponent,
  IncidentioStatusPage,
  IncidentioStatusPageIncident,
  WidgetComponent,
  WidgetIncident,
  WidgetMaintenance,
  WidgetSummary,
} from "@/services/incidentio-client.js";

// Spec types
export type {
  HttpMethod,
  OperationInfo,
  SpecIndex,
  SpecParameter,
} from "@/spec/index.js";

export { HTTP_METHODS } from "@/spec/index.js";
// Tool types (AdapterContext, ServiceAdapter) - exported from tools
export type { AdapterContext, ServiceAdapter } from "@/tools/index.js";
// Auth types
export type { AuthStore } from "@/types/auth.js";
// Client types
export type {
  FrontalClientOptions,
  FrontalResponse,
  RateLimitInfo,
  RequestOptions,
  RetryConfig,
} from "@/types/client.js";
// Core types
export type {
  AuthConfig,
  ConfigOptions,
  IncidentioConfig,
  RateLimitConfig,
  ServerConfig,
  Toolset,
  TransportConfig,
} from "@/types/config.js";
export {
  parseCsvList,
  parseToolsets,
  TOOLSETS,
  toolsetSchema,
} from "@/types/config.js";
// Error types
export {
  ConfigError,
  ERROR_CODE,
  type ErrorCode,
  type ErrorContext,
  type ErrorEnvelope,
  FrontalApiError,
  FrontalError,
  isFrontalApiError,
  isFrontalError,
  isRetryableError,
  parseErrorEnvelope,
  RETRYABLE_STATUS,
  SpecError,
  ToolInputError,
} from "@/types/errors.js";
// Logger types
export type { LoggerConfig } from "@/types/logger.js";
// Rate limiter types
export type { RateLimitDecision, RateLimiter } from "@/types/rate-limit.js";
