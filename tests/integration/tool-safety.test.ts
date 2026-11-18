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

/**
 * Smoke test for tool safety, as a real client sees it over the wire:
 * annotations, read-only mode, structured output and confirmation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EVENTS_QUERY_PATH,
  MOCK_DATASETS,
  type MockEdge,
  PIPELINES_PATH,
  startMockEdge,
} from "../mocks/mock-edge.js";
import {
  connectHttp,
  connectStdio,
  type ElicitAnswer,
  type Harness,
  HTTP_TOKEN,
  type HttpServerUnderTest,
  SPAWN_TIMEOUT_MS,
  startHttpServer,
  textOf,
} from "../utils/mcp-harness.js";

const WRITE_TOOLS = [
  "data_create_pipeline",
  "data_ingest_dataset",
  "ontology_extract_entities",
  "integrations_test_connection",
];

const NEW_TOOLS = [
  "workflows_search",
  "workflows_get_run",
  "workflows_get_run_summary",
  "workflows_get_run_timeline",
  "integrations_get",
  "integrations_list_capabilities",
  "integrations_list_action_runs",
  "action_runs_get",
  "integrations_test_connection",
  "connection_tests_get",
  "events_list",
  "events_get",
  "events_query",
  "providers_get",
];

describe("tool safety", () => {
  let edge: MockEdge;
  let server: HttpServerUnderTest;
  let readOnlyServer: HttpServerUnderTest;
  const open: Harness[] = [];

  async function http(
    target: HttpServerUnderTest,
    era: "legacy" | "modern",
    onElicit?: (message: string) => ElicitAnswer
  ): Promise<Harness> {
    const harness = await connectHttp(target.url, era, HTTP_TOKEN, {
      onElicit,
    });
    open.push(harness);
    return harness;
  }

  function pipelineCalls(): number {
    return edge.requests.filter(
      (request) => request.method === "POST" && request.path === PIPELINES_PATH
    ).length;
  }

  beforeAll(async () => {
    edge = await startMockEdge();
    [server, readOnlyServer] = await Promise.all([
      startHttpServer(edge),
      startHttpServer(edge, {}, { readOnly: true }),
    ]);
  });

  afterAll(async () => {
    await Promise.allSettled(open.map((harness) => harness.close()));
    await Promise.allSettled([server?.stop(), readOnlyServer?.stop()]);
    await edge?.close();
  });

  describe.each(["legacy", "modern"] as const)("annotations (%s)", (era) => {
    it("annotates every tool", async () => {
      const { client } = await http(server, era);
      const { tools } = await client.listTools();

      expect(tools.length).toBeGreaterThan(30);
      for (const tool of tools) {
        expect(tool.annotations, tool.name).toBeDefined();
        expect(typeof tool.annotations?.readOnlyHint, tool.name).toBe(
          "boolean"
        );
        expect(typeof tool.annotations?.openWorldHint, tool.name).toBe(
          "boolean"
        );
        if (tool.annotations?.readOnlyHint === false) {
          expect(typeof tool.annotations.destructiveHint, tool.name).toBe(
            "boolean"
          );
          expect(typeof tool.annotations.idempotentHint, tool.name).toBe(
            "boolean"
          );
        }
      }
    });

    it("marks exactly the write tools as not read-only", async () => {
      const { client } = await http(server, era);
      const { tools } = await client.listTools();
      const writers = tools
        .filter((tool) => tool.annotations?.readOnlyHint === false)
        .map((tool) => tool.name)
        .sort();

      expect(writers).toEqual([...WRITE_TOOLS, "frontal_call_endpoint"].sort());
    });

    it("sets openWorldHint only on tools that reach external systems", async () => {
      const { client } = await http(server, era);
      const { tools } = await client.listTools();
      const openWorld = tools
        .filter((tool) => tool.annotations?.openWorldHint === true)
        .map((tool) => tool.name)
        .sort();

      expect(openWorld).toEqual([
        "frontal_call_endpoint",
        "integrations_test_connection",
      ]);
    });

    it("marks every tool that is not read-only as destructive", async () => {
      // A client that cannot be asked for confirmation relies on this hint
      // to show its own approval prompt.
      const { client } = await http(server, era);
      const { tools } = await client.listTools();

      for (const tool of tools) {
        const destructive = tool.annotations?.destructiveHint === true;
        const readOnly = tool.annotations?.readOnlyHint === true;
        expect(destructive, tool.name).toBe(!readOnly);
      }
    });
  });

  it("lists the curated workflow, integration and event tools", async () => {
    const { client } = await http(server, "modern");
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    for (const tool of NEW_TOOLS) {
      expect(names).toContain(tool);
    }
    expect(names).not.toContain("integrations_run_action");
  });

  describe.each(["legacy", "modern"] as const)("read-only mode (%s)", (era) => {
    it("does not register write tools, and keeps the read tools", async () => {
      const { client } = await http(readOnlyServer, era);
      const names = (await client.listTools()).tools.map((tool) => tool.name);

      for (const tool of WRITE_TOOLS) {
        expect(names).not.toContain(tool);
      }
      for (const tool of [
        "data_list_datasets",
        "ontology_query_graph",
        "events_query",
        "workflows_search",
        "frontal_call_endpoint",
      ]) {
        expect(names).toContain(tool);
      }
    });

    it("refuses a write through frontal_call_endpoint without calling the API", async () => {
      const { client } = await http(readOnlyServer, era);
      const attempts = [
        { operationId: "postV1DataPipelinesPipelines", body: { name: "x" } },
        { method: "POST", path: PIPELINES_PATH, body: { name: "x" } },
        {
          operationId: "deleteV1IntegrationsIntegrationId",
          pathParams: { integrationId: "int_1" },
        },
        { method: "DELETE", path: "/v1/not/in/the/spec" },
        // A POST that is not on the read-only allow-list is a write, even
        // though its name sounds harmless.
        { operationId: "postV1EventsUsage", body: {} },
      ];

      for (const args of attempts) {
        const before = edge.requests.length;
        const result = await client.callTool({
          name: "frontal_call_endpoint",
          arguments: args,
        });

        expect(result.isError, JSON.stringify(args)).toBe(true);
        expect(textOf(result)).toContain("read-only mode");
        expect(edge.requests.length).toBe(before);
      }
    });

    it("still allows GET and the allow-listed read-only POST operations", async () => {
      const { client } = await http(readOnlyServer, era);

      const list = await client.callTool({
        name: "frontal_call_endpoint",
        arguments: { operationId: "getV1DataCatalogCatalogDatasets" },
      });
      expect(list.isError).toBeFalsy();
      expect(JSON.parse(textOf(list))).toEqual({ items: MOCK_DATASETS });

      const before = edge.requests.length;
      const query = await client.callTool({
        name: "frontal_call_endpoint",
        arguments: { operationId: "postV1EventsQuery", body: {} },
      });
      expect(query.isError).toBeFalsy();
      expect(edge.requests.slice(before)).toMatchObject([
        { method: "POST", path: EVENTS_QUERY_PATH },
      ]);

      const curated = await client.callTool({
        name: "events_query",
        arguments: { query: {} },
      });
      expect(curated.isError).toBeFalsy();
    });
  });

  it("allows writes through frontal_call_endpoint when not in read-only mode", async () => {
    const { client } = await http(server, "modern");
    const before = pipelineCalls();

    const result = await client.callTool({
      name: "frontal_call_endpoint",
      arguments: {
        operationId: "postV1DataPipelinesPipelines",
        body: { name: "x" },
      },
    });

    expect(result.isError).toBeFalsy();
    expect(pipelineCalls()).toBe(before + 1);
  });

  describe.each(["legacy", "modern"] as const)(
    "structured output (%s)",
    (era) => {
      it("returns the response as structuredContent and keeps the JSON text", async () => {
        const { client } = await http(server, era);
        const result = await client.callTool({
          name: "data_list_datasets",
          arguments: {},
        });

        expect(result.structuredContent).toEqual({ items: MOCK_DATASETS });
        expect(JSON.parse(textOf(result))).toEqual({ items: MOCK_DATASETS });
      });
    }
  );

  describe("confirmation before a write", () => {
    const ARGS = { definition: { name: "orders" } };

    it("asks an elicitation-capable client, and runs on yes (modern)", async () => {
      const questions: string[] = [];
      const { client } = await http(server, "modern", (message) => {
        questions.push(message);
        return { action: "accept", content: { confirm: true } };
      });
      const before = pipelineCalls();

      const result = await client.callTool({
        name: "data_create_pipeline",
        arguments: ARGS,
      });

      expect(questions).toEqual(["Create data pipeline `orders`?"]);
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({
        id: "pl_1",
        status: "created",
      });
      expect(pipelineCalls()).toBe(before + 1);
    });

    it.each([
      ["answers no", { action: "accept", content: { confirm: false } }],
      ["declines", { action: "decline" }],
      ["cancels", { action: "cancel" }],
    ] as const)(
      "does not run when the user %s (modern)",
      async (_label, answer) => {
        const { client } = await http(server, "modern", () => answer);
        const before = pipelineCalls();

        const result = await client.callTool({
          name: "data_create_pipeline",
          arguments: ARGS,
        });

        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain("was not run");
        expect(pipelineCalls()).toBe(before);
      }
    );

    it("runs directly for a client without elicitation (modern)", async () => {
      const { client } = await http(server, "modern");
      const before = pipelineCalls();

      const result = await client.callTool({
        name: "data_create_pipeline",
        arguments: ARGS,
      });

      expect(result.isError).toBeFalsy();
      expect(pipelineCalls()).toBe(before + 1);
    });

    it("runs directly on stateless legacy HTTP, which cannot ask", async () => {
      const { client } = await http(server, "legacy", () => ({
        action: "decline",
      }));
      const before = pipelineCalls();

      const result = await client.callTool({
        name: "data_create_pipeline",
        arguments: ARGS,
      });

      expect(result.isError).toBeFalsy();
      expect(pipelineCalls()).toBe(before + 1);
    });

    it(
      "asks a legacy stdio client through a real elicitation request",
      async () => {
        const questions: string[] = [];
        const harness = await connectStdio(edge, "legacy", {
          onElicit: (message) => {
            questions.push(message);
            return { action: "decline" };
          },
        });
        open.push(harness);
        const before = pipelineCalls();

        const result = await harness.client.callTool({
          name: "data_create_pipeline",
          arguments: ARGS,
        });

        expect(questions).toEqual(["Create data pipeline `orders`?"]);
        expect(result.isError).toBe(true);
        expect(pipelineCalls()).toBe(before);
      },
      SPAWN_TIMEOUT_MS
    );

    it("never asks before a read tool", async () => {
      const questions: string[] = [];
      const { client } = await http(server, "modern", (message) => {
        questions.push(message);
        return { action: "decline" };
      });

      for (const [name, args] of [
        ["data_list_datasets", {}],
        // A POST on the read allow-list is a read.
        ["events_query", { query: {} }],
      ] as const) {
        const result = await client.callTool({ name, arguments: args });
        expect(result.isError, name).toBeFalsy();
      }
      expect(questions).toEqual([]);
    });

    it("asks before every curated write tool, and a no stops each one", async () => {
      const questions: string[] = [];
      const { client } = await http(server, "modern", (message) => {
        questions.push(message);
        return { action: "decline" };
      });
      const calls: [string, Record<string, unknown>][] = [
        ["data_create_pipeline", { definition: { name: "orders" } }],
        ["data_ingest_dataset", { request: { dataset_id: "ds_1" } }],
        ["ontology_extract_entities", { request: { text: "hello" } }],
        ["integrations_test_connection", { integration_id: "int_1" }],
      ];
      expect(calls.map(([name]) => name).sort()).toEqual(
        [...WRITE_TOOLS].sort()
      );

      for (const [name, args] of calls) {
        const before = edge.requests.length;
        const result = await client.callTool({ name, arguments: args });

        expect(result.isError, name).toBe(true);
        expect(textOf(result), name).toContain("was not run");
        expect(edge.requests.length, name).toBe(before);
      }
      expect(questions).toHaveLength(calls.length);
      expect(questions[1]).toContain("`ds_1`");
      expect(questions[3]).toContain("`int_1`");
    });
  });

  describe("confirmation in frontal_call_endpoint", () => {
    const WRITES = [
      { operationId: "postV1DataPipelinesPipelines", body: { name: "x" } },
      { method: "POST", path: PIPELINES_PATH, body: { name: "x" } },
      {
        operationId: "deleteV1IntegrationsIntegrationId",
        pathParams: { integrationId: "int_1" },
      },
      { method: "DELETE", path: "/v1/not/in/the/spec" },
      // A POST that is not on the read allow-list.
      { operationId: "postV1EventsUsage", body: {} },
    ];

    it("asks before any operation that is not on the read allow-list", async () => {
      const questions: string[] = [];
      const { client } = await http(server, "modern", (message) => {
        questions.push(message);
        return { action: "decline" };
      });

      for (const args of WRITES) {
        const before = edge.requests.length;
        const result = await client.callTool({
          name: "frontal_call_endpoint",
          arguments: args,
        });

        expect(result.isError, JSON.stringify(args)).toBe(true);
        expect(textOf(result)).toContain("was not run");
        expect(edge.requests.length).toBe(before);
      }
      expect(questions).toHaveLength(WRITES.length);
      expect(questions[0]).toContain(
        "postV1DataPipelinesPipelines (POST /v1/data/pipelines/pipelines)"
      );
      expect(questions[3]).toContain("DELETE /v1/not/in/the/spec");
    });

    it("runs the write once the user says yes", async () => {
      const { client } = await http(server, "modern", () => ({
        action: "accept",
        content: { confirm: true },
      }));
      const before = pipelineCalls();

      const result = await client.callTool({
        name: "frontal_call_endpoint",
        arguments: WRITES[0],
      });

      expect(result.isError).toBeFalsy();
      expect(pipelineCalls()).toBe(before + 1);
    });

    it("does not ask for GET or for an allow-listed read-only POST", async () => {
      const questions: string[] = [];
      const { client } = await http(server, "modern", (message) => {
        questions.push(message);
        return { action: "decline" };
      });

      for (const args of [
        { operationId: "getV1DataCatalogCatalogDatasets" },
        { method: "GET", path: "/v1/data/catalog/catalog/datasets" },
        { operationId: "postV1EventsQuery", body: {} },
      ]) {
        const result = await client.callTool({
          name: "frontal_call_endpoint",
          arguments: args,
        });
        expect(result.isError, JSON.stringify(args)).toBeFalsy();
      }
      expect(questions).toEqual([]);
    });

    it("reports an unknown operationId without asking", async () => {
      const questions: string[] = [];
      const { client } = await http(server, "modern", (message) => {
        questions.push(message);
        return { action: "decline" };
      });

      const result = await client.callTool({
        name: "frontal_call_endpoint",
        arguments: { operationId: "noSuchOperation" },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("Unknown operationId");
      expect(questions).toEqual([]);
    });
  });

  describe("protocol era counter", () => {
    it("counts served requests by era and rejected ones separately", async () => {
      const counted = await startHttpServer(edge);
      try {
        const legacy = await connectHttp(counted.url, "legacy");
        await legacy.client.listTools();
        await legacy.close();
        const afterLegacy = counted.transport.requestCounts;
        expect(afterLegacy.legacy).toBeGreaterThanOrEqual(2);
        expect(afterLegacy.modern).toBe(0);

        const modern = await connectHttp(counted.url, "modern");
        await modern.client.listTools();
        await modern.close();
        expect(counted.transport.requestCounts.modern).toBeGreaterThanOrEqual(
          2
        );
        expect(counted.transport.requestCounts.legacy).toBe(afterLegacy.legacy);

        const rejectedBefore = counted.transport.requestCounts.rejected;
        const response = await fetch(`${counted.url}/mcp`, {
          method: "GET",
          headers: { Authorization: `Bearer ${HTTP_TOKEN}` },
        });
        expect(response.status).toBe(405);
        expect(counted.transport.requestCounts.rejected).toBe(
          rejectedBefore + 1
        );
      } finally {
        await counted.stop();
      }
    });
  });
});
