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
import {
  fromJsonSchema,
  type McpServer,
  type ServerContext,
  type ToolAnnotations,
} from "@modelcontextprotocol/server";
import type { z } from "zod";
import type { OperationInfo } from "@/spec/index.js";
import { taskForStartedRun } from "@/tasks/handlers.js";
import { confirmWrite, notConfirmed } from "@/tools/confirmation.js";
import { deriveOutputSchema } from "@/tools/output-schema.js";
import { isReadOnlyOperation } from "@/tools/policy.js";
import {
  type CallOperationInput,
  callOperation,
  toToolError,
  toToolResult,
} from "@/tools/tool-helpers.js";
import type { AdapterContext } from "@/tools/types.js";

export interface CuratedToolDef {
  /**
   * Safety hints shown to the client. Required: every tool declares what it
   * does. Use a preset from `ANNOTATIONS` in `policy.ts`.
   */
  annotations: ToolAnnotations;
  /**
   * The question put to the user before a write runs, for example "Create
   * data pipeline `orders`?". Optional: a tool whose operation is not on the
   * read allow-list is always confirmed, with a generic question naming the
   * operation when this is not set. Ignored for read-only tools.
   */
  confirm?: (args: Record<string, unknown>) => string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  map?: (args: Record<string, unknown>) => CallOperationInput;
  name: string;
  operationId: string;
  title: string;
}

/**
 * The annotations a tool is registered with. A tool whose operation is not
 * on the read allow-list is always marked destructive, whatever it declared,
 * so that a client which cannot be asked for confirmation still shows its
 * own approval prompt.
 */
function effectiveAnnotations(
  def: CuratedToolDef,
  readOnly: boolean
): ToolAnnotations {
  const annotations = { title: def.title, ...def.annotations };
  return readOnly
    ? annotations
    : { ...annotations, readOnlyHint: false, destructiveHint: true };
}

function defaultQuestion(def: CuratedToolDef, op: OperationInfo): string {
  return `Run "${def.title}" (${op.method.toUpperCase()} ${op.path})? This changes data.`;
}

export function registerCuratedTool(
  server: McpServer,
  ctx: AdapterContext,
  def: CuratedToolDef
): void {
  const op = ctx.spec.getByOperationId(def.operationId);
  if (!op) {
    ctx.logger.warn(
      `Skipping curated tool ${def.name}: operationId ${def.operationId} not found in spec`
    );
    return;
  }

  // Whether the tool reads or writes is decided by its operation, not by
  // what it declares. A tool may only call itself read-only if its
  // operation is known to be.
  const readOnly = isReadOnlyOperation(op);
  if (def.annotations.readOnlyHint === true && !readOnly) {
    throw new Error(
      `Curated tool ${def.name} declares readOnlyHint, but ${def.operationId} (${op.method.toUpperCase()}) is not a read-only operation. Fix its annotations, or add the operation to READ_ONLY_POST_OPERATIONS if it truly has no side effects.`
    );
  }
  if (ctx.config.readOnly && !readOnly) {
    ctx.logger.debug(`Read-only mode: not registering write tool ${def.name}`);
    return;
  }

  const derived = deriveOutputSchema(ctx.spec, op);
  const outputSchema =
    "schema" in derived ? fromJsonSchema(derived.schema) : undefined;

  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.inputSchema,
      ...(outputSchema ? { outputSchema } : {}),
      annotations: effectiveAnnotations(def, readOnly),
    },
    async (args: Record<string, unknown>, toolCtx: ServerContext) => {
      try {
        if (!readOnly) {
          const question = def.confirm?.(args) ?? defaultQuestion(def, op);
          const outcome = confirmWrite(server, toolCtx, question);
          if (outcome.status === "ask") return outcome.request;
          if (outcome.status === "declined") {
            return toToolError(notConfirmed(def.name));
          }
        }
        const input = def.map ? def.map(args) : {};
        const response = await callOperation(ctx, def.operationId, input);
        // A tool that starts a run answers with a task when the client can
        // track one. The SDK's tool result type predates the Tasks
        // extension, hence the cast.
        const task = taskForStartedRun(ctx, toolCtx, def.operationId, response);
        return task ? (task as never) : toToolResult(response);
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
