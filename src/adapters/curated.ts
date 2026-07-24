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
