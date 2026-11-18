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
 * Statelessness test: no request may depend on an earlier one.
 *
 * Two independent server instances listen on different ports. One real MCP
 * client talks to both through a `fetch` that alternates between them on
 * every request, the way a round-robin load balancer would. If the server
 * kept any per-client state (a session, a handshake result), the request
 * that lands on the other instance would fail.
 */
import {
  type Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MOCK_DATASETS,
  type MockEdge,
  startMockEdge,
} from "../mocks/mock-edge.js";
import {
  type Era,
  HTTP_TOKEN,
  type HttpServerUnderTest,
  MODERN_PROTOCOL_VERSION,
  newClient,
  startHttpServer,
  textOf,
} from "../utils/mcp-harness.js";

interface RoundRobin {
  /** How many MCP requests each instance has served, by base URL. */
  counts: Map<string, number>;
  fetch: typeof fetch;
}

/** A `fetch` that sends each request to the next instance in turn. */
function roundRobin(urls: string[]): RoundRobin {
  const counts = new Map(urls.map((url) => [url, 0]));
  let next = 0;
  return {
    counts,
    fetch: (input, init) => {
      const target = urls[next % urls.length];
      next++;
      counts.set(target, (counts.get(target) ?? 0) + 1);
      const { pathname, search } = new URL(
        input instanceof Request ? input.url : String(input)
      );
      return fetch(`${target}${pathname}${search}`, init);
    },
  };
}

describe("statelessness across two instances", () => {
  let edge: MockEdge;
  let instanceA: HttpServerUnderTest;
  let instanceB: HttpServerUnderTest;

  beforeAll(async () => {
    edge = await startMockEdge();
    [instanceA, instanceB] = await Promise.all([
      startHttpServer(edge),
      startHttpServer(edge),
    ]);
  });

  afterAll(async () => {
    await Promise.allSettled([instanceA?.stop(), instanceB?.stop()]);
    await edge?.close();
  });

  async function connect(
    era: Era
  ): Promise<{ balancer: RoundRobin; client: Client }> {
    const balancer = roundRobin([instanceA.url, instanceB.url]);
    const client = newClient(era);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${instanceA.url}/mcp`), {
        fetch: balancer.fetch,
        requestInit: { headers: { Authorization: `Bearer ${HTTP_TOKEN}` } },
      })
    );
    return { balancer, client };
  }

  it("runs on two distinct instances", () => {
    expect(instanceA.url).not.toBe(instanceB.url);
  });

  describe.each(["legacy", "modern"] as const)("%s era", (era) => {
    it("serves consecutive requests that alternate between the instances", async () => {
      const { balancer, client } = await connect(era);
      try {
        expect(client.getProtocolEra()).toBe(era);
        if (era === "modern") {
          expect(client.getNegotiatedProtocolVersion()).toBe(
            MODERN_PROTOCOL_VERSION
          );
        }

        const CALLS = 6;
        for (let index = 0; index < CALLS; index++) {
          const { tools } = await client.listTools();
          expect(tools.map((tool) => tool.name)).toContain(
            "frontal_list_endpoints"
          );

          const result = await client.callTool({
            name: "data_list_datasets",
            arguments: {},
          });
          expect(result.isError).toBeFalsy();
          expect(JSON.parse(textOf(result))).toEqual({ items: MOCK_DATASETS });
        }

        // Both instances really took part. The count is not exact: a modern
        // client caches tools/list for the advertised ttlMs.
        const served = [...balancer.counts.values()];
        expect(served).toHaveLength(2);
        for (const count of served) {
          expect(count).toBeGreaterThanOrEqual(CALLS / 2);
        }
      } finally {
        await client.close();
      }
    });

    it("serves a client whose every request lands on a different instance than the handshake", async () => {
      // Handshake against A only, then send everything else to B only.
      const handshake = newClient(era);
      await handshake.connect(
        new StreamableHTTPClientTransport(new URL(`${instanceA.url}/mcp`), {
          requestInit: { headers: { Authorization: `Bearer ${HTTP_TOKEN}` } },
        })
      );
      await handshake.close();

      const onlyB = roundRobin([instanceB.url]);
      const client = newClient(era);
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${instanceA.url}/mcp`), {
          fetch: onlyB.fetch,
          requestInit: { headers: { Authorization: `Bearer ${HTTP_TOKEN}` } },
        })
      );
      try {
        const result = await client.callTool({
          name: "frontal_describe_endpoint",
          arguments: { operationId: "getV1DataCatalogCatalogDatasets" },
        });
        expect(result.isError).toBeFalsy();
      } finally {
        await client.close();
      }
    });
  });

  it("answers a legacy tools/call sent cold to an instance that never saw the client", async () => {
    // No client library, no handshake: one raw request to a fresh instance.
    const response = await fetch(`${instanceB.url}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${HTTP_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "data_list_datasets", arguments: {} },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
    expect(await response.text()).toContain("ds_1");
  });
});
