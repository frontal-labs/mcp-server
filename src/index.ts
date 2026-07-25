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

export type { AdapterContext, ServiceAdapter } from "./adapters/types.js";
export {
  FrontalClient,
  type FrontalClientOptions,
  type FrontalResponse,
  type RateLimitInfo,
  type RequestOptions,
} from "./clients/frontal-client.js";
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
} from "./lib/error.js";
export {
  type AuthConfig,
  type ConfigOptions,
  createConfig,
  loadConfig,
  type ServerConfig,
  type Toolset,
  type TransportConfig,
} from "./config/index.js";
export { EnhancedHttpTransport } from "./server/enhanced-http-transport.js";
export { FrontalMcpServer } from "./server/mcp-server.js";
export { HealthMonitor } from "./services/health-monitor.js";
export {
  IncidentioApiError,
  IncidentioClient,
  type IncidentioComponent,
  type IncidentioStatusPage,
  type IncidentioStatusPageIncident,
  type WidgetComponent,
  type WidgetIncident,
  type WidgetMaintenance,
  type WidgetSummary,
} from "./services/incidentio-client.js";
export { loadSpecIndex, SpecIndex } from "./spec/spec-index.js";
export { createLogger } from "./utils/logger.js";
