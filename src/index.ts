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
 * @frontal-labs/mcp-server
 *
 * Model Context Protocol server for the Frontal public API (api.frontal.dev).
 * Exposes the API as a hybrid of curated, typed tools (ontology, data) and
 * spec-driven generic meta-tools that cover the full endpoint surface.
 */

// Also export the actual classes/functions from their modules
export { FrontalClient } from "@/client.js";
export { FrontalMcpServer } from "@/mcp/index.js";
export { HttpTransport } from "@/middlewares/http-transport.js";
export {
  createRateLimiter,
  rateLimitIdentifier,
} from "@/middlewares/rate-limit.js";
export { HealthMonitor } from "@/services/health-monitor.js";
export {
  IncidentioApiError,
  IncidentioClient,
} from "@/services/incidentio-client.js";
export { HTTP_METHODS } from "@/spec/index.js";
export { loadSpecIndex } from "@/spec/spec-index.js";
export {
  parseCsvList,
  parseToolsets,
  TOOLSETS,
  toolsetSchema,
} from "@/types/config.js";
export {
  ConfigError,
  ERROR_CODE,
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
// Re-export all types from the types barrel
export type {
  // Tool types
  AdapterContext,
  // Core types
  AuthConfig,
  // Auth types
  AuthStore,
  ConfigOptions,
  // Error types
  ErrorCode,
  ErrorContext,
  ErrorEnvelope,
  // Client types
  FrontalClientOptions,
  FrontalResponse,
  // Spec types
  HttpMethod,
  // Incident.io types
  IncidentioComponent,
  IncidentioConfig,
  IncidentioStatusPage,
  IncidentioStatusPageIncident,
  // Logger types
  LoggerConfig,
  // MCP server types
  McpServer,
  OperationInfo,
  RateLimitConfig,
  // Rate limiter types
  RateLimitDecision,
  RateLimiter,
  RateLimitInfo,
  RequestOptions,
  RetryConfig,
  ServerConfig,
  ServiceAdapter,
  SpecIndex,
  SpecParameter,
  Toolset,
  TransportConfig,
  WidgetComponent,
  WidgetIncident,
  WidgetMaintenance,
  WidgetSummary,
} from "@/types/index.js";
export { createLogger } from "@/utils/logger.js";
export { VERSION } from "@/version.js";
