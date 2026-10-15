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

export {
  // Core types
  type AdapterContext,
  type AuthConfig,
  ConfigError,
  type ConfigOptions,
  // Logger types
  createLogger,
  createRateLimiter,
  // Error types
  ERROR_CODE,
  type ErrorCode,
  type ErrorContext,
  type ErrorEnvelope,
  FrontalApiError,
  FrontalClient,
  // Client types
  type FrontalClientOptions,
  FrontalError,
  // MCP server
  FrontalMcpServer,
  type FrontalResponse,
  // Health monitor
  HealthMonitor,
  HTTP_METHODS,
  // Spec types
  type HttpMethod,
  // Middlewares
  HttpTransport,
  // Incident.io
  IncidentioApiError,
  IncidentioClient,
  type IncidentioComponent,
  type IncidentioConfig,
  type IncidentioStatusPage,
  type IncidentioStatusPageIncident,
  isFrontalApiError,
  isFrontalError,
  isRetryableError,
  type LoggerConfig,
  // Spec
  loadSpecIndex,
  type OperationInfo,
  parseCsvList,
  parseErrorEnvelope,
  parseToolsets,
  type RateLimitConfig,
  type RateLimitInfo,
  RETRYABLE_STATUS,
  type RequestOptions,
  type RetryConfig,
  rateLimitIdentifier,
  type ServerConfig,
  type ServiceAdapter,
  SpecError,
  type SpecIndex,
  type SpecParameter,
  TOOLSETS,
  ToolInputError,
  type Toolset,
  type TransportConfig,
  toolsetSchema,
  // Version
  VERSION,
  type WidgetComponent,
  type WidgetIncident,
  type WidgetMaintenance,
  type WidgetSummary,
} from "@/types/index.js";
