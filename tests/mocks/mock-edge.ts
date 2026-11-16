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
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A request the mock edge received, kept so tests can assert on what the
 * MCP server actually sent upstream (path, auth).
 */
export interface MockEdgeRequest {
  authorization: string | undefined;
  method: string;
  path: string;
}

export interface MockEdge {
  baseUrl: string;
  close(): Promise<void>;
  requests: MockEdgeRequest[];
}

export const MOCK_DATASETS = [
  { id: "ds_1", name: "orders" },
  { id: "ds_2", name: "customers" },
];

const DATASETS_PATH = "/v1/data/catalog/catalog/datasets";
export const PIPELINES_PATH = "/v1/data/pipelines/pipelines";
export const EVENTS_QUERY_PATH = "/v1/events/query";

function send(
  res: import("node:http").ServerResponse,
  status: number,
  body: unknown
): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const POST_ROUTES: Record<string, unknown> = {
  [PIPELINES_PATH]: { id: "pl_1", status: "created" },
  [EVENTS_QUERY_PATH]: { items: [{ id: "evt_1" }] },
};

/** The status and body the mock API answers an authenticated request with. */
function route(method: string, path: string): [number, unknown] {
  if (method === "POST" && path in POST_ROUTES) {
    return [201, POST_ROUTES[path]];
  }
  if (path === DATASETS_PATH) {
    return [200, { items: MOCK_DATASETS }];
  }
  if (path.startsWith(`${DATASETS_PATH}/`)) {
    const id = path.slice(DATASETS_PATH.length + 1);
    const dataset = MOCK_DATASETS.find((entry) => entry.id === id);
    if (dataset) return [200, dataset];
  }
  return [404, { error: { code: "not_found", message: "no route" } }];
}

/**
 * Start a local stand-in for the Frontal public API edge.
 *
 * It listens on a real socket so the whole stack is exercised: tool →
 * `callOperation` → `FrontalClient` → HTTP. It is also reachable from a
 * child process, which the stdio smoke test relies on.
 */
export function startMockEdge(): Promise<MockEdge> {
  const requests: MockEdgeRequest[] = [];

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const authorization = req.headers.authorization;
    requests.push({
      authorization,
      method: req.method ?? "GET",
      path: url.pathname,
    });

    if (!authorization?.startsWith("Bearer frt_")) {
      send(res, 401, {
        error: { code: "unauthorized", message: "Missing or invalid API key" },
      });
      return;
    }

    const [status, body] = route(req.method ?? "GET", url.pathname);
    send(res, status, body);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        requests,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

/** Ask the OS for a currently free TCP port on the loopback interface. */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}
