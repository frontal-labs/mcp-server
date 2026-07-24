import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ERROR_CODE, SpecError, ToolInputError } from "@/lib/error.js";
import {
  type CallOperationInput,
  callOperation,
  substitutePath,
  toToolError,
  toToolResult,
} from "./tool-helpers.js";
import type { AdapterContext, ServiceAdapter } from "./types.js";

const DEFAULT_PAGE = 50;
const MAX_PAGE = 200;

/**
 * Spec-driven meta-tools that expose the entire public API surface without a
 * dedicated tool per endpoint. This is the coverage escape hatch behind the
 * curated tools.
 */
export class GenericAdapter implements ServiceAdapter {
  name = "generic";
  toolset = "generic" as const;

  register(server: McpServer, ctx: AdapterContext): void {
    this.registerListEndpoints(server, ctx);
    this.registerDescribeEndpoint(server, ctx);
    this.registerCallEndpoint(server, ctx);
  }

  private registerListEndpoints(server: McpServer, ctx: AdapterContext): void {
    server.registerTool(
      "frontal_list_endpoints",
      {
        title: "List Frontal API endpoints",
        description:
          "Browse the Frontal public API surface. Filter by tag (e.g. 'ontology', 'data', 'events', 'integrations', 'webhook-endpoints', 'workflows') and/or a free-text search over path/summary/operationId. Returns a compact, paginated list of operations to feed into frontal_describe_endpoint or frontal_call_endpoint.",
        inputSchema: {
          tag: z.string().optional().describe("Filter by tag"),
          search: z
            .string()
            .optional()
            .describe("Free-text match over operationId, path, and summary"),
          limit: z.number().int().min(1).max(MAX_PAGE).optional(),
          offset: z.number().int().min(0).optional(),
        },
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
    server.registerTool(
      "frontal_describe_endpoint",
      {
        title: "Describe a Frontal API endpoint",
        description:
          "Return full detail for one operation (parameters, request body, responses, auth) so you can construct a correct frontal_call_endpoint call. Look up by operationId (from frontal_list_endpoints).",
        inputSchema: {
          operationId: z.string().describe("The operationId to describe"),
        },
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
    server.registerTool(
      "frontal_call_endpoint",
      {
        title: "Call a Frontal API endpoint",
        description:
          "Invoke any Frontal public API operation. Identify it either by operationId, or by method + templated path. Provide pathParams for `{placeholders}`, query for query-string params, and body for the JSON request body. Set autoPaginate for cursor-paginated GET lists.",
        inputSchema: {
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
        },
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
    }
  ): Promise<unknown> {
    const callInput: CallOperationInput = {
      pathParams: input.pathParams,
      query: input.query,
      body: input.body,
      autoPaginate: input.autoPaginate,
    };

    if (input.operationId) {
      return callOperation(ctx, input.operationId, callInput);
    }

    if (!(input.method && input.path)) {
      throw new ToolInputError(
        "Provide either operationId, or both method and path.",
        ERROR_CODE.INVALID_ARGUMENTS
      );
    }

    // Prefer the spec-matched operation so we validate against a real endpoint.
    const matched = ctx.spec.getByMethodPath(input.method, input.path);
    if (matched) {
      return callOperation(ctx, matched.operationId, callInput);
    }

    // Fall back to a raw call for paths the inventory may not enumerate.
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
    });
    return response.data;
  }
}
