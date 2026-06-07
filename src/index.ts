/**
 * @frontal-labs/mcp-server
 *
 * Model Context Protocol server for Frontal services.
 * Provides standardized access to AI, Blob, Functions, Graph, and Pipelines.
 */

export type { ServiceAdapter } from "./adapters/types.js";
export {
  type AuthConfig,
  type ConfigOptions,
  createConfig,
  loadConfig,
  type ServerConfig,
  type TransportConfig,
} from "./config/index.js";
export { EnhancedHttpTransport } from "./server/enhanced-http-transport.js";
export { FrontalMcpServer } from "./server/mcp-server.js";
export { ApiError, FrontalApiClient } from "./services/api-client.js";
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
export { createLogger } from "./utils/logger.js";
