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
import { beforeEach, describe, expect, it } from "vitest";
import { DataAdapter } from "@/adapters/data-adapter.js";
import { GenericAdapter } from "@/adapters/generic-adapter.js";
import { OntologyAdapter } from "@/adapters/ontology-adapter.js";
import type { AdapterContext } from "@/adapters/types.js";
import type { FrontalClient } from "@/clients/frontal-client.js";
import { loadSpecIndex } from "@/spec/spec-index.js";
import { createLogger } from "@/utils/logger.js";

type Handler = (args: Record<string, unknown>) =>
  | Promise<{ content: { text: string }[]; isError?: boolean }>
  | {
      content: { text: string }[];
      isError?: boolean;
    };

interface RecordedCall {
  method: string;
  path: string;
  options: Record<string, unknown>;
}

class StubClient {
  calls: RecordedCall[] = [];
  paginateCalls: { path: string; options: Record<string, unknown> }[] = [];

  request(method: string, path: string, options: Record<string, unknown> = {}) {
    this.calls.push({ method, path, options });
    return Promise.resolve({
      data: { echoed: true, method, path, options },
      status: 200,
      rateLimit: {},
      requestId: "req_test",
    });
  }

  paginate(path: string, options: Record<string, unknown> = {}) {
    this.paginateCalls.push({ path, options });
    return Promise.resolve([{ page: 1 }, { page: 2 }]);
  }
}

function harness() {
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _def: unknown, handler: Handler) => {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;

  const client = new StubClient();
  const ctx: AdapterContext = {
    client: client as unknown as FrontalClient,
    spec: loadSpecIndex(),
    logger: createLogger({ level: "error" }),
    config: {} as AdapterContext["config"],
    getToken: () => "frt_test",
  };

  new GenericAdapter().register(server, ctx);
  new OntologyAdapter().register(server, ctx);
  new DataAdapter().register(server, ctx);

  return { handlers, client };
}

function parse(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

describe("tool layer", () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  describe("generic meta-tools", () => {
    it("lists endpoints filtered by tag with paging", async () => {
      const res = await h.handlers.get("frontal_list_endpoints")?.({
        tag: "data",
        limit: 3,
      });
      const data = parse(res as { content: { text: string }[] });
      expect(data.total).toBeGreaterThan(0);
      expect(data.endpoints).toHaveLength(3);
      expect(data.endpoints[0].method).toBeDefined();
    });

    it("describes an endpoint by operationId", async () => {
      const res = await h.handlers.get("frontal_describe_endpoint")?.({
        operationId: "getV1DataCatalogCatalogDatasetsDataset_id",
      });
      const data = parse(res as { content: { text: string }[] });
      expect(data.path).toBe("/v1/data/catalog/catalog/datasets/{dataset_id}");
      expect(
        data.parameters.some((p: { name: string }) => p.name === "dataset_id")
      ).toBe(true);
    });

    it("returns an error for an unknown operationId in describe", async () => {
      const res = await h.handlers.get("frontal_describe_endpoint")?.({
        operationId: "doesNotExist",
      });
      expect((res as { isError?: boolean }).isError).toBe(true);
    });

    it("calls an endpoint by operationId", async () => {
      await h.handlers.get("frontal_call_endpoint")?.({
        operationId: "getV1DataCatalogCatalogDatasets",
        query: { limit: 5 },
      });
      expect(h.client.calls[0]).toMatchObject({
        method: "GET",
        path: "/v1/data/catalog/catalog/datasets",
      });
    });

    it("calls an endpoint by method + path with path params", async () => {
      await h.handlers.get("frontal_call_endpoint")?.({
        method: "GET",
        path: "/v1/data/catalog/catalog/datasets/{dataset_id}",
        pathParams: { dataset_id: "ds_1" },
      });
      expect(h.client.calls[0].path).toBe(
        "/v1/data/catalog/catalog/datasets/ds_1"
      );
    });

    it("auto-paginates when requested", async () => {
      await h.handlers.get("frontal_call_endpoint")?.({
        operationId: "getV1DataCatalogCatalogDatasets",
        autoPaginate: true,
      });
      expect(h.client.paginateCalls).toHaveLength(1);
    });

    it("errors when neither operationId nor method+path provided", async () => {
      const res = await h.handlers.get("frontal_call_endpoint")?.({});
      expect((res as { isError?: boolean }).isError).toBe(true);
    });
  });

  describe("curated ontology tools", () => {
    it("gets an object by id (path param)", async () => {
      await h.handlers.get("ontology_get_object")?.({ object_id: "obj_1" });
      expect(h.client.calls[0].path).toBe("/v1/ontology/objects/objects/obj_1");
    });

    it("lists objects with query params", async () => {
      await h.handlers.get("ontology_list_objects")?.({
        object_type_id: "t1",
        limit: 10,
      });
      expect(h.client.calls[0]).toMatchObject({
        method: "GET",
        path: "/v1/ontology/objects/objects",
      });
      expect(h.client.calls[0].options).toMatchObject({
        query: { object_type_id: "t1", limit: 10 },
      });
    });

    it("queries the graph with a body", async () => {
      await h.handlers.get("ontology_query_graph")?.({
        query: { start: "a" },
      });
      expect(h.client.calls[0]).toMatchObject({
        method: "POST",
        path: "/v1/ontology/graph/graph/query",
      });
      expect(h.client.calls[0].options).toMatchObject({
        body: { start: "a" },
      });
    });
  });

  describe("curated data tools", () => {
    it("runs a federated query with a body", async () => {
      await h.handlers.get("data_query_federated")?.({ query: { sql: "x" } });
      expect(h.client.calls[0]).toMatchObject({
        method: "POST",
        path: "/v1/data/query/query/federated",
      });
    });

    it("gets a dataset by id", async () => {
      await h.handlers.get("data_get_dataset")?.({ dataset_id: "ds_9" });
      expect(h.client.calls[0].path).toBe(
        "/v1/data/catalog/catalog/datasets/ds_9"
      );
    });

    it("lists datasets", async () => {
      const res = await h.handlers.get("data_list_datasets")?.({ limit: 2 });
      const data = parse(res as { content: { text: string }[] });
      expect(data.echoed).toBe(true);
    });
  });
});
