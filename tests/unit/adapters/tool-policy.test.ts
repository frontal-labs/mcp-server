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
import type { McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { FrontalClient } from "@/client.js";
import { SpecIndex } from "@/spec/index.js";
import { loadSpecIndex } from "@/spec/spec-index.js";
import { type CuratedToolDef, registerCuratedTool } from "@/tools/curated.js";
import { DataAdapter } from "@/tools/data-adapter.js";
import { EventsAdapter } from "@/tools/events-adapter.js";
import { GenericAdapter } from "@/tools/generic-adapter.js";
import { IntegrationsAdapter } from "@/tools/integrations-adapter.js";
import { OntologyAdapter } from "@/tools/ontology-adapter.js";
import {
  deriveOutputSchema,
  MAX_OUTPUT_SCHEMA_CHARS,
} from "@/tools/output-schema.js";
import {
  ANNOTATIONS,
  isReadOnlyOperation,
  READ_ONLY_POST_OPERATIONS,
} from "@/tools/policy.js";
import type { AdapterContext, ServiceAdapter } from "@/tools/types.js";
import { WorkflowsAdapter } from "@/tools/workflows-adapter.js";
import { createLogger } from "@/utils/logger.js";

const ALL_ADAPTERS: ServiceAdapter[] = [
  new GenericAdapter(),
  new OntologyAdapter(),
  new DataAdapter(),
  new WorkflowsAdapter(),
  new IntegrationsAdapter(),
  new EventsAdapter(),
];

interface Registered {
  config: {
    annotations?: ToolAnnotations;
    outputSchema?: unknown;
  };
  handler: (
    args: Record<string, unknown>,
    ctx: unknown
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

interface RecordedCall {
  method: string;
  options: Record<string, unknown>;
  path: string;
}

function harness(options: { readOnly?: boolean; spec?: SpecIndex } = {}) {
  const tools = new Map<string, Registered>();
  const server = {
    registerTool: (
      name: string,
      config: Registered["config"],
      handler: Registered["handler"]
    ) => {
      tools.set(name, { config, handler });
    },
    server: { getClientCapabilities: () => undefined },
  } as unknown as McpServer;

  const calls: RecordedCall[] = [];
  const client = {
    request: (
      method: string,
      path: string,
      requestOptions: Record<string, unknown> = {}
    ) => {
      calls.push({ method, path, options: requestOptions });
      return Promise.resolve({ data: { ok: true }, status: 200 });
    },
  } as unknown as FrontalClient;

  const ctx: AdapterContext = {
    client,
    spec: options.spec ?? loadSpecIndex(),
    logger: createLogger({ level: "error" }),
    config: { readOnly: options.readOnly ?? false } as AdapterContext["config"],
    getToken: () => "frt_test",
  };
  return { tools, server, ctx, calls };
}

/** A tool context for a client that cannot be asked anything. */
const NO_ELICITATION = { mcpReq: {} };

function registerAll(options: { readOnly?: boolean } = {}) {
  const h = harness(options);
  for (const adapter of ALL_ADAPTERS) adapter.register(h.server, h.ctx);
  return h;
}

/** A minimal spec with one typed, one loose and one array response. */
function syntheticSpec(): SpecIndex {
  const json = (schema: unknown) => ({
    "200": { content: { "application/json": { schema } } },
  });
  return new SpecIndex({
    openapi: "3.0.0",
    info: { title: "test", version: "0" },
    components: {
      schemas: {
        Dataset: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" }, rows: { type: "integer" } },
        },
      },
    },
    paths: {
      "/typed": {
        get: {
          operationId: "getTyped",
          responses: json({ $ref: "#/components/schemas/Dataset" }),
        },
        post: {
          operationId: "postTyped",
          responses: json({ $ref: "#/components/schemas/Dataset" }),
        },
      },
      "/loose": {
        get: {
          operationId: "getLoose",
          responses: json({ type: "object", additionalProperties: true }),
        },
      },
      "/array": {
        get: {
          operationId: "getArray",
          responses: json({ type: "array", items: { type: "string" } }),
        },
      },
      "/huge": {
        get: {
          operationId: "getHuge",
          responses: json({
            type: "object",
            properties: {
              field: {
                type: "string",
                description: "x".repeat(MAX_OUTPUT_SCHEMA_CHARS),
              },
            },
          }),
        },
      },
      "/empty": {
        delete: { operationId: "deleteEmpty", responses: { "204": {} } },
      },
    },
  } as unknown as ConstructorParameters<typeof SpecIndex>[0]);
}

function tool(overrides: Partial<CuratedToolDef>): CuratedToolDef {
  return {
    name: "test_tool",
    title: "Test tool",
    description: "A test tool.",
    operationId: "getTyped",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({}),
    ...overrides,
  };
}

describe("tool annotations", () => {
  it("every registered tool declares complete annotations", () => {
    const { tools } = registerAll();

    expect(tools.size).toBeGreaterThan(30);
    for (const [name, { config }] of tools) {
      expect(config.annotations, name).toBeDefined();
      expect(typeof config.annotations?.readOnlyHint, name).toBe("boolean");
      expect(typeof config.annotations?.openWorldHint, name).toBe("boolean");
      if (config.annotations?.readOnlyHint === false) {
        expect(typeof config.annotations.destructiveHint, name).toBe("boolean");
        expect(typeof config.annotations.idempotentHint, name).toBe("boolean");
      }
    }
  });

  it("refuses to register a tool that claims read-only on a write operation", () => {
    const { server, ctx } = harness();

    expect(() =>
      registerCuratedTool(
        server,
        ctx,
        tool({
          name: "sneaky",
          operationId: "postV1DataPipelinesPipelines",
          annotations: ANNOTATIONS.read,
        })
      )
    ).toThrow(/declares readOnlyHint/);
  });
});

describe("read-only classification", () => {
  it("treats GET as read-only and other methods as writes", () => {
    expect(isReadOnlyOperation({ method: "get", operationId: "x" })).toBe(true);
    for (const method of ["post", "put", "patch", "delete"] as const) {
      expect(isReadOnlyOperation({ method, operationId: "x" })).toBe(false);
    }
  });

  it("treats only allow-listed POST operations as read-only", () => {
    for (const operationId of READ_ONLY_POST_OPERATIONS) {
      expect(isReadOnlyOperation({ method: "post", operationId })).toBe(true);
    }
    for (const operationId of [
      "postV1Events",
      "postV1EventsUsage",
      "postV1WorkflowsBatch",
      "postV1DataPipelinesPipelines",
    ]) {
      expect(isReadOnlyOperation({ method: "post", operationId })).toBe(false);
    }
  });

  it("only allow-lists POST operations that exist in the spec", () => {
    const spec = loadSpecIndex();
    for (const operationId of READ_ONLY_POST_OPERATIONS) {
      expect(spec.getByOperationId(operationId)?.method, operationId).toBe(
        "post"
      );
    }
  });

  it("registers only read-only tools in read-only mode", () => {
    const all = registerAll();
    const readOnly = registerAll({ readOnly: true });

    for (const [name, { config }] of readOnly.tools) {
      expect(config.annotations?.readOnlyHint, name).toBe(true);
    }
    const dropped = [...all.tools.keys()].filter(
      (name) => !readOnly.tools.has(name)
    );
    expect(dropped.sort()).toEqual([
      "data_create_pipeline",
      "data_ingest_dataset",
      "integrations_test_connection",
      "ontology_extract_entities",
    ]);
  });
});

describe("output schema derivation", () => {
  const spec = syntheticSpec();
  const derive = (operationId: string) => {
    const op = spec.getByOperationId(operationId);
    if (!op) throw new Error(`missing ${operationId}`);
    return deriveOutputSchema(spec, op);
  };

  it("derives a schema from a typed response, resolving $ref", () => {
    expect(derive("getTyped")).toEqual({
      schema: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" }, rows: { type: "integer" } },
      },
    });
  });

  it.each([
    ["getLoose", "too-loose"],
    ["getArray", "not-an-object"],
    ["getHuge", "too-large"],
    ["deleteEmpty", "no-json-response"],
  ])("skips %s as %s", (operationId, reason) => {
    expect(derive(operationId)).toEqual({ skipped: reason });
  });

  it("advertises outputSchema only for a tool with a typed response", () => {
    const { server, ctx, tools } = harness({ spec });
    registerCuratedTool(server, ctx, tool({ name: "typed" }));
    registerCuratedTool(
      server,
      ctx,
      tool({ name: "loose", operationId: "getLoose" })
    );

    expect(tools.get("typed")?.config.outputSchema).toBeDefined();
    expect(tools.get("loose")?.config.outputSchema).toBeUndefined();
  });

  it("finds no typed response schema in the vendored spec today", () => {
    // Every 2xx response in openapi/public.v1.json is currently
    // `{ type: object, additionalProperties: true }`, so no curated tool
    // advertises an outputSchema yet. When the spec gains typed responses
    // this test fails: update it, and review the schemas the tools then
    // advertise.
    const { tools } = registerAll();
    const withSchema = [...tools]
      .filter(([, { config }]) => config.outputSchema !== undefined)
      .map(([name]) => name);

    expect(withSchema).toEqual([]);
  });
});

describe("curated workflow, integration and event tools", () => {
  it.each([
    [
      "workflows_search",
      { request: { status: "failed" } },
      "POST",
      "/v1/workflows/search",
    ],
    [
      "workflows_get_run",
      { workflow_id: "wf 1", run_id: "r1" },
      "GET",
      "/v1/workflows/wf%201/r1",
    ],
    [
      "workflows_get_run_summary",
      { workflow_id: "wf1", run_id: "r1" },
      "GET",
      "/v1/workflows/wf1/r1/summary",
    ],
    [
      "workflows_get_run_timeline",
      { workflow_id: "wf1", run_id: "r1" },
      "GET",
      "/v1/workflows/wf1/r1/timeline",
    ],
    [
      "integrations_get",
      { integration_id: "int_1" },
      "GET",
      "/v1/integrations/int_1",
    ],
    [
      "integrations_list_capabilities",
      { integration_id: "int_1" },
      "GET",
      "/v1/integrations/int_1/capabilities",
    ],
    [
      "integrations_list_action_runs",
      { integration_id: "int_1" },
      "GET",
      "/v1/integrations/int_1/action-runs",
    ],
    [
      "action_runs_get",
      { action_run_id: "ar_1" },
      "GET",
      "/v1/action-runs/ar_1",
    ],
    [
      "integrations_test_connection",
      { integration_id: "int_1" },
      "POST",
      "/v1/integrations/int_1/connection-tests",
    ],
    [
      "connection_tests_get",
      { connection_test_id: "ct_1" },
      "GET",
      "/v1/connection-tests/ct_1",
    ],
    ["events_list", { query: { limit: 5 } }, "GET", "/v1/events"],
    ["events_get", { event_id: "evt_1" }, "GET", "/v1/events/evt_1"],
    ["events_query", { query: { type: "x" } }, "POST", "/v1/events/query"],
    ["providers_get", { provider_slug: "slack" }, "GET", "/v1/providers/slack"],
  ])("%s calls %s %s", async (name, args, method, path) => {
    const { tools, calls } = registerAll();

    const result = await tools.get(name)?.handler(args, NO_ELICITATION);

    expect(result?.isError).toBeFalsy();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe(method);
    expect(calls[0].path).toBe(path);
    expect(calls[0].options.token).toBe("frt_test");
  });

  it("passes bodies and query filters through", async () => {
    const { tools, calls } = registerAll();

    await tools
      .get("workflows_search")
      ?.handler({ request: { status: "failed" } }, NO_ELICITATION);
    await tools
      .get("events_list")
      ?.handler({ query: { limit: 5 } }, NO_ELICITATION);

    expect(calls[0].options.body).toEqual({ status: "failed" });
    expect(calls[1].options.query).toEqual({ limit: 5 });
  });

  it("returns the response as structuredContent", async () => {
    const { tools } = registerAll();

    const result = await tools
      .get("events_get")
      ?.handler({ event_id: "evt_1" }, NO_ELICITATION);

    expect(result?.structuredContent).toEqual({ ok: true });
  });
});
