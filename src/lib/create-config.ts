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
import { env } from "@/config/env.js";
import {
  parseToolsets,
  type ServerConfig,
  serverConfigSchema,
} from "./server-config.js";

export function createConfig(
  overrides: Record<string, unknown> = {}
): ServerConfig {
  const defaults = {
    apiKey: env.FRONTAL_API_KEY,
    baseUrl: env.FRONTAL_BASE_URL,
    region: env.FRONTAL_REGION,
    toolsets: parseToolsets(env.FRONTAL_TOOLSETS),
    transport: { transport: "stdio" as const },
    auth: { type: "api-key" as const },
    incidentio: {
      apiKey: env.INCIDENTIO_API_KEY,
      statusPageId: env.INCIDENTIO_STATUS_PAGE_ID,
      statusPageUrl: env.INCIDENTIO_STATUS_PAGE_URL,
      componentId: env.INCIDENTIO_COMPONENT_ID,
    },
    rateLimit: {
      redisUrl: env.UPSTASH_REDIS_REST_URL,
      redisToken: env.UPSTASH_REDIS_REST_TOKEN,
      requests: env.FRONTAL_RATE_LIMIT_REQUESTS,
      window: env.FRONTAL_RATE_LIMIT_WINDOW,
      prefix: env.FRONTAL_RATE_LIMIT_PREFIX,
      timeoutMs: env.FRONTAL_RATE_LIMIT_TIMEOUT_MS,
    },
    logLevel: env.MCP_LOG_LEVEL,
    verbose: false,
  };
  return serverConfigSchema.parse({ ...defaults, ...overrides });
}
