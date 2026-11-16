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

function send(
  res: import("node:http").ServerResponse,
  status: number,
  body: unknown
): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
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

    if (url.pathname === DATASETS_PATH) {
      send(res, 200, { items: MOCK_DATASETS });
      return;
    }

    if (url.pathname.startsWith(`${DATASETS_PATH}/`)) {
      const id = url.pathname.slice(DATASETS_PATH.length + 1);
      const dataset = MOCK_DATASETS.find((entry) => entry.id === id);
      if (dataset) {
        send(res, 200, dataset);
        return;
      }
    }

    send(res, 404, { error: { code: "not_found", message: "no route" } });
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
