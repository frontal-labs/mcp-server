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
import { type CuratedToolDef, registerCuratedTool } from "@/tools/curated.js";
import { ANNOTATIONS } from "@/tools/policy.js";
import type { AdapterContext, ServiceAdapter } from "@/tools/types.js";

/*
 * Read-only by design. Event ingest, bulk, reprocess, usage, metering,
 * benchmark, billing and internal operations have no curated tool; they
 * stay reachable only through `frontal_call_endpoint`.
 */
const TOOLS: CuratedToolDef[] = [
  {
    name: "events_list",
    title: "List events",
    description: "List events. Narrow the list with query-string filters.",
    operationId: "getV1Events",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({
      query: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Optional query-string filters"),
    }),
    map: (a) => ({ query: a.query as Record<string, unknown> | undefined }),
  },
  {
    name: "events_get",
    title: "Get an event",
    description: "Fetch one event by its id.",
    operationId: "getV1EventsId",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({
      event_id: z.string().describe("The event id"),
    }),
    map: (a) => ({ pathParams: { id: a.event_id as string } }),
  },
  {
    name: "events_query",
    title: "Query events",
    description:
      "Run a query over events. Pass the query (filters, grouping, time range) as the body. This reads only; it ingests nothing.",
    operationId: "postV1EventsQuery",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({
      query: z.record(z.string(), z.unknown()).describe("Event query body"),
    }),
    map: (a) => ({ body: a.query }),
  },
];

export class EventsAdapter implements ServiceAdapter {
  name = "events";
  toolset = "events" as const;

  register(server: McpServer, ctx: AdapterContext): void {
    for (const tool of TOOLS) {
      registerCuratedTool(server, ctx, tool);
    }
  }
}
