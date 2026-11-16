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
  CLIENT_CAPABILITIES_META_KEY,
  type ClientCapabilities,
  fromJsonSchema,
  inputRequired,
  inputResponse,
  type McpServer,
  type ServerContext,
  type ToolAnnotations,
} from "@modelcontextprotocol/server";
import { z } from "zod";
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
   * For tools that write: the question to put to the user before running,
   * for example "Create pipeline `orders` in region `fra`?". When set, and
   * the client supports elicitation, the tool asks first and runs only on
   * an explicit yes. Clients without elicitation run it directly; their own
   * approval UI covers it.
   */
  confirm?: (args: Record<string, unknown>) => string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  map?: (args: Record<string, unknown>) => CallOperationInput;
  name: string;
  operationId: string;
  title: string;
}

/** Key of the confirmation request in `inputRequests` / `inputResponses`. */
const CONFIRM_KEY = "confirm";

const confirmationSchema = z.object({
  confirm: z.boolean().describe("Run this operation?"),
});

/**
 * Whether the client can answer an elicitation for this request.
 *
 * On 2026-07-28 the capabilities travel with every request. On a 2025-era
 * connection they come from the `initialize` handshake, which only a
 * connection-pinned instance (stdio) has seen; a stateless legacy HTTP
 * request has none, and the tool then runs without asking.
 */
function clientSupportsElicitation(
  server: McpServer,
  toolCtx: ServerContext
): boolean {
  const envelope = toolCtx.mcpReq.envelope as
    | Record<string, unknown>
    | undefined;
  const capabilities =
    (envelope?.[CLIENT_CAPABILITIES_META_KEY] as
      | ClientCapabilities
      | undefined) ?? server.server.getClientCapabilities();
  return capabilities?.elicitation !== undefined;
}

type ConfirmationOutcome =
  | { status: "confirmed" }
  | { status: "declined" }
  | { status: "ask"; request: ReturnType<typeof inputRequired> };

/**
 * One round of the confirmation exchange. This is a courtesy to the user,
 * not an access control: the answer comes back from the client, and a
 * client that wants to skip the question can. The API's own authorization
 * is what actually protects the data.
 */
function confirmWithUser(
  toolCtx: ServerContext,
  question: string
): ConfirmationOutcome {
  const answer = inputResponse(toolCtx.mcpReq.inputResponses, CONFIRM_KEY);
  if (answer.kind !== "elicit") {
    return {
      status: "ask",
      request: inputRequired({
        inputRequests: {
          [CONFIRM_KEY]: inputRequired.elicit({
            message: question,
            requestedSchema: confirmationSchema,
          }),
        },
      }),
    };
  }
  const confirmed =
    answer.action === "accept" && answer.content?.confirm === true;
  return { status: confirmed ? "confirmed" : "declined" };
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

  // A tool may only call itself read-only if its operation is known to be.
  const readOnly = def.annotations.readOnlyHint === true;
  if (readOnly && !isReadOnlyOperation(op)) {
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
      annotations: { title: def.title, ...def.annotations },
    },
    async (args: Record<string, unknown>, toolCtx: ServerContext) => {
      try {
        if (def.confirm && clientSupportsElicitation(server, toolCtx)) {
          const outcome = confirmWithUser(toolCtx, def.confirm(args));
          if (outcome.status === "ask") return outcome.request;
          if (outcome.status === "declined") {
            return toToolError(
              new Error(
                `${def.name} was not run: the user did not confirm the operation.`
              )
            );
          }
        }
        const input = def.map ? def.map(args) : {};
        return toToolResult(await callOperation(ctx, def.operationId, input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );
}
