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

const integrationRef = {
  integration_id: z.string().describe("The integration id"),
};

const integrationPath = (a: Record<string, unknown>) => ({
  pathParams: { integrationId: a.integration_id as string },
});

/*
 * The public API has no endpoint that lists integrations, so there is no
 * `integrations_list` tool: callers need an integration id from elsewhere.
 * `integrations_run_action` is deliberately absent too; it acts on external
 * systems and stays reachable only through `frontal_call_endpoint`.
 */
const TOOLS: CuratedToolDef[] = [
  {
    name: "integrations_get",
    title: "Get an integration",
    description: "Fetch one integration by id.",
    operationId: "getV1IntegrationsIntegrationId",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({ ...integrationRef }),
    map: integrationPath,
  },
  {
    name: "integrations_list_capabilities",
    title: "List an integration's capabilities",
    description:
      "List the capabilities of one integration: what it can do and which are enabled.",
    operationId: "getV1IntegrationsIntegrationIdCapabilities",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({ ...integrationRef }),
    map: integrationPath,
  },
  {
    name: "integrations_list_action_runs",
    title: "List an integration's action runs",
    description:
      "List the action runs of one integration: past executions of its actions and their status.",
    operationId: "getV1IntegrationsIntegrationIdAction_runs",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({
      ...integrationRef,
      query: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Optional query-string filters"),
    }),
    map: (a) => ({
      ...integrationPath(a),
      query: a.query as Record<string, unknown> | undefined,
    }),
  },
  {
    name: "action_runs_get",
    title: "Get an action run",
    description: "Fetch one integration action run by its id.",
    operationId: "getV1Action_runsActionRunId",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({
      action_run_id: z.string().describe("The action run id"),
    }),
    map: (a) => ({ pathParams: { actionRunId: a.action_run_id as string } }),
  },
  {
    name: "integrations_test_connection",
    title: "Test an integration's connection",
    description:
      "Start a connection test for one integration. It contacts the external system the integration connects to, without changing data there, and records the test in Frontal. Read the outcome with connection_tests_get.",
    operationId: "postV1IntegrationsIntegrationIdConnection_tests",
    annotations: ANNOTATIONS.externalWrite,
    inputSchema: z.object({
      ...integrationRef,
      request: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Optional connection-test request body"),
    }),
    map: (a) => ({ ...integrationPath(a), body: a.request ?? {} }),
    confirm: (a) =>
      `Test the connection of integration \`${String(a.integration_id)}\`? This contacts the external system it connects to.`,
  },
  {
    name: "connection_tests_get",
    title: "Get a connection test",
    description: "Fetch one connection test by its id, including its result.",
    operationId: "getV1Connection_testsConnectionTestId",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({
      connection_test_id: z.string().describe("The connection test id"),
    }),
    map: (a) => ({
      pathParams: { connectionTestId: a.connection_test_id as string },
    }),
  },
  {
    name: "providers_get",
    title: "Get an integration provider",
    description:
      "Fetch one integration provider by its slug: what the provider is and what it supports.",
    operationId: "getV1ProvidersProviderSlug",
    annotations: ANNOTATIONS.read,
    inputSchema: z.object({
      provider_slug: z.string().describe("The provider slug"),
    }),
    map: (a) => ({ pathParams: { providerSlug: a.provider_slug as string } }),
  },
];

export class IntegrationsAdapter implements ServiceAdapter {
  name = "integrations";
  toolset = "integrations" as const;

  register(server: McpServer, ctx: AdapterContext): void {
    for (const tool of TOOLS) {
      registerCuratedTool(server, ctx, tool);
    }
  }
}
