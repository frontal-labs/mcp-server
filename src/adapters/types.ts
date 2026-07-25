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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "winston";
import type { FrontalClient } from "@/clients/frontal-client.js";
import type { ServerConfig, Toolset } from "@/lib/server-config.js";
import type { SpecIndex } from "@/spec/spec-index.js";

/** Shared services handed to every adapter at registration time. */
export interface AdapterContext {
  client: FrontalClient;
  spec: SpecIndex;
  logger: Logger;
  config: ServerConfig;
  /**
   * Resolve the bearer token for the current call: the per-request token
   * (HTTP transport) if present, otherwise the configured API key.
   */
  getToken(): string | undefined;
}

/** A registrable group of MCP tools backed by the Frontal API. */
export interface ServiceAdapter {
  name: string;
  /** Which tool set this adapter belongs to (gated by `FRONTAL_TOOLSETS`). */
  toolset: Toolset;
  register(server: McpServer, ctx: AdapterContext): void;
}
