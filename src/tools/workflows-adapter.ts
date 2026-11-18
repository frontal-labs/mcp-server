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

const runRef = {
  workflow_id: z.string().describe("The workflow id"),
  run_id: z.string().describe("The workflow run id"),
};

const runPath = (a: Record<string, unknown>) => ({
  pathParams: {
    workflow_id: a.workflow_id as string,
    run_id: a.run_id as string,
  },
});

const TOOLS: CuratedToolDef[] = [
  {
    name: "workflows_search",
    title: "Search workflow runs",
    description:
      "Search workflow runs. Pass the search request (filters, paging) as the body. This reads only; it starts nothing.",
    operationId: "postV1WorkflowsSearch",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({
      request: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Search request body"),
    }),
    map: (a) => ({ body: a.request ?? {} }),
  },
  {
    name: "workflows_get_run",
    title: "Get a workflow run",
    description: "Fetch one workflow run by workflow id and run id.",
    operationId: "getV1WorkflowsWorkflow_idRun_id",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({ ...runRef }),
    map: runPath,
  },
  {
    name: "workflows_get_run_summary",
    title: "Get a workflow run summary",
    description:
      "Fetch the summary of one workflow run: its outcome and key figures.",
    operationId: "getV1WorkflowsWorkflow_idRun_idSummary",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({ ...runRef }),
    map: runPath,
  },
  {
    name: "workflows_get_run_timeline",
    title: "Get a workflow run timeline",
    description:
      "Fetch the timeline of one workflow run: its steps and events in order. Useful for finding where a run failed.",
    operationId: "getV1WorkflowsWorkflow_idRun_idTimeline",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({ ...runRef }),
    map: runPath,
  },
];

export class WorkflowsAdapter implements ServiceAdapter {
  name = "workflows";
  toolset = "workflows" as const;

  register(server: McpServer, ctx: AdapterContext): void {
    for (const tool of TOOLS) {
      registerCuratedTool(server, ctx, tool);
    }
  }
}
