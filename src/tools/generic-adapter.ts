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
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  ANNOTATIONS,
  isReadOnlyOperation,
  isSafeMethod,
} from "@/tools/policy.js";
import {
  type CallOperationInput,
  callOperation,
  substitutePath,
  toToolError,
  toToolResult,
} from "@/tools/tool-helpers.js";
import type { AdapterContext, ServiceAdapter } from "@/tools/types.js";
import { ERROR_CODE, SpecError, ToolInputError } from "@/types/errors.js";

const CALL_ENDPOINT_DESCRIPTION =
  "Invoke any Frontal public API operation. Identify it either by operationId, or by method + templated path. Provide pathParams for `{placeholders}`, query for query-string params, and body for the JSON request body. Set autoPaginate for cursor-paginated GET lists.";

const DEFAULT_PAGE = 50;
const MAX_PAGE = 200;

export class GenericAdapter implements ServiceAdapter {
  name = "generic";
  toolset = "generic" as const;

  register(server: McpServer, ctx: AdapterContext): void {
    this.registerListEndpoints(server, ctx);
    this.registerDescribeEndpoint(server, ctx);
    this.registerCallEndpoint(server, ctx);
  }

  private registerListEndpoints(server: McpServer, ctx: AdapterContext): void {
    const listEndpointsSchema = z.object({
      tag: z.string().optional().describe("Filter by tag"),
      search: z
        .string()
        .optional()
        .describe("Free-text match over operationId, path, and summary"),
      limit: z.number().int().min(1).max(MAX_PAGE).optional(),
      offset: z.number().int().min(0).optional(),
    });

    server.registerTool(
      "frontal_list_endpoints",
      {
        title: "List Frontal API endpoints",
        description:
          "Browse the Frontal public API surface. Filter by tag (e.g. 'ontology', 'data', 'events', 'integrations', 'webhook-endpoints', 'workflows') and/or a free-text search over path/summary/operationId. Returns a compact, paginated list of operations to feed into frontal_describe_endpoint or frontal_call_endpoint.",
        inputSchema: listEndpointsSchema,
        annotations: ANNOTATIONS.read,
      },
      ({ tag, search, limit, offset }) => {
        try {
          const all = ctx.spec.list({ tag, search });
          const start = offset ?? 0;
          const size = limit ?? DEFAULT_PAGE;
          const page = all.slice(start, start + size);
          return toToolResult({
            total: all.length,
            offset: start,
            count: page.length,
            availableTags: tag ? undefined : ctx.spec.allTags(),
            endpoints: page.map((op) => ({
              operationId: op.operationId,
              method: op.method.toUpperCase(),
              path: op.path,
              summary: op.summary,
            })),
          });
        } catch (error) {
          return toToolError(error);
        }
      }
    );
  }

  private registerDescribeEndpoint(
    server: McpServer,
    ctx: AdapterContext
  ): void {
    const describeEndpointSchema = z.object({
      operationId: z.string().describe("The operationId to describe"),
    });

    server.registerTool(
      "frontal_describe_endpoint",
      {
        title: "Describe a Frontal API endpoint",
        description:
          "Return full detail for one operation (parameters, request body, responses, auth) so you can construct a correct frontal_call_endpoint call. Look up by operationId (from frontal_list_endpoints).",
        inputSchema: describeEndpointSchema,
        annotations: ANNOTATIONS.read,
      },
      ({ operationId }) => {
        const op = ctx.spec.getByOperationId(operationId);
        if (!op) {
          return toToolError(
            new SpecError(
              `Unknown operationId: ${operationId}. Use frontal_list_endpoints to discover valid ids.`,
              ERROR_CODE.UNKNOWN_OPERATION,
              { operationId }
            )
          );
        }
        return toToolResult({
          operationId: op.operationId,
          method: op.method.toUpperCase(),
          path: op.path,
          tags: op.tags,
          summary: op.summary,
          requiresAuth: op.requiresAuth,
          parameters: op.parameters.map((p) => ({
            name: p.name,
            in: p.in,
            required: p.required,
            description: p.description,
            schema: ctx.spec.dereference(p.schema),
          })),
          requestBody: ctx.spec.dereference(op.requestBody),
          responses: ctx.spec.dereference(op.responses),
        });
      }
    );
  }

  private registerCallEndpoint(server: McpServer, ctx: AdapterContext): void {
    const callEndpointSchema = z.object({
      operationId: z
        .string()
        .optional()
        .describe("Operation to call (preferred)"),
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
        .optional()
        .describe("HTTP method (use with path if no operationId)"),
      path: z
        .string()
        .optional()
        .describe(
          "Templated path, e.g. /v1/ontology/objects/objects/{object_id}"
        ),
      pathParams: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .optional(),
      query: z.record(z.string(), z.unknown()).optional(),
      body: z.unknown().optional(),
      autoPaginate: z.boolean().optional(),
      idempotencyKey: z
        .string()
        .optional()
        .describe(
          "Stable key for retry-safe writes; reuse across retries of the same logical write so the edge can dedupe"
        ),
    });

    server.registerTool(
      "frontal_call_endpoint",
      {
        title: "Call a Frontal API endpoint",
        description: ctx.config.readOnly
          ? `${CALL_ENDPOINT_DESCRIPTION} This server is in read-only mode: only operations that read data can be called.`
          : CALL_ENDPOINT_DESCRIPTION,
        inputSchema: callEndpointSchema,
        // It can call any operation, so it is annotated for the worst case.
        // In read-only mode it stays registered but refuses writes.
        annotations: ctx.config.readOnly
          ? ANNOTATIONS.read
          : ANNOTATIONS.unrestricted,
      },
      async (input) => {
        try {
          const data = await this.dispatchCall(ctx, input);
          return toToolResult(data);
        } catch (error) {
          return toToolError(error);
        }
      }
    );
  }

  /**
   * In read-only mode, refuse any operation that is not known to only read.
   * The check uses the operation's entry in the spec index and the explicit
   * read-only allow-list, not the HTTP method alone.
   */
  private assertAllowed(ctx: AdapterContext, operationId: string): void {
    if (!ctx.config.readOnly) return;
    const op = ctx.spec.getByOperationId(operationId);
    // An unknown id is reported as such by callOperation.
    if (op && !isReadOnlyOperation(op)) {
      throw readOnlyRefusal(
        `${operationId} (${op.method.toUpperCase()} ${op.path})`
      );
    }
  }

  private async dispatchCall(
    ctx: AdapterContext,
    input: {
      operationId?: string;
      method?: string;
      path?: string;
      pathParams?: Record<string, string | number>;
      query?: Record<string, unknown>;
      body?: unknown;
      autoPaginate?: boolean;
      idempotencyKey?: string;
    }
  ): Promise<unknown> {
    const callInput: CallOperationInput = {
      pathParams: input.pathParams,
      query: input.query,
      body: input.body,
      autoPaginate: input.autoPaginate,
      idempotencyKey: input.idempotencyKey,
    };

    if (input.operationId) {
      this.assertAllowed(ctx, input.operationId);
      return callOperation(ctx, input.operationId, callInput);
    }

    if (!(input.method && input.path)) {
      throw new ToolInputError(
        "Provide either operationId, or both method and path.",
        ERROR_CODE.INVALID_ARGUMENTS
      );
    }

    const matched = ctx.spec.getByMethodPath(input.method, input.path);
    if (matched) {
      this.assertAllowed(ctx, matched.operationId);
      return callOperation(ctx, matched.operationId, callInput);
    }

    // The path is not in the spec, so nothing is known about the operation
    // beyond its HTTP method. Read-only mode lets through safe methods only.
    if (ctx.config.readOnly && !isSafeMethod(input.method)) {
      throw readOnlyRefusal(`${input.method.toUpperCase()} ${input.path}`);
    }

    const resolvedPath = substitutePath(input.path, input.pathParams);
    const token = ctx.getToken();
    if (input.autoPaginate && input.method.toUpperCase() === "GET") {
      return {
        pages: await ctx.client.paginate(resolvedPath, {
          query: input.query,
          token,
        }),
      };
    }
    const response = await ctx.client.request(input.method, resolvedPath, {
      query: input.query,
      body: input.body,
      token,
      idempotencyKey: input.idempotencyKey,
    });
    return response.data;
  }
}

function readOnlyRefusal(operation: string): ToolInputError {
  return new ToolInputError(
    `Refused: this server is in read-only mode (FRONTAL_READ_ONLY=true) and ${operation} is not a read-only operation. Only operations that read data can be called.`,
    ERROR_CODE.READ_ONLY
  );
}
