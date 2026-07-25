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
import type { z } from "zod";
import {
  type CallOperationInput,
  callOperation,
  toToolError,
  toToolResult,
} from "./tool-helpers.js";
import type { AdapterContext } from "./types.js";

/** A curated tool: a friendly wrapper bound to one real spec operation. */
export interface CuratedToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  operationId: string;
  /** Map validated tool args to a spec-operation call. */
  map?: (args: Record<string, unknown>) => CallOperationInput;
}

/** Register a curated tool that validates against, and calls, a real operation. */
export function registerCuratedTool(
  server: McpServer,
  ctx: AdapterContext,
  def: CuratedToolDef
): void {
  // Guard against spec drift: refuse to register a tool with no real operation.
  if (!ctx.spec.getByOperationId(def.operationId)) {
    ctx.logger.warn(
      `Skipping curated tool ${def.name}: operationId ${def.operationId} not found in spec`
    );
    return;
  }
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.inputSchema,
    },
    async (args: Record<string, unknown>) => {
      try {
        const input = def.map ? def.map(args) : {};
        return toToolResult(await callOperation(ctx, def.operationId, input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
