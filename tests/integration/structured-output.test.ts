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
 * Structured output end to end, for an operation whose response is typed.
 *
 * The vendored spec has no typed response schema yet, so this test uses a
 * small spec of its own. It proves the path a typed operation will take:
 * the tool advertises an `outputSchema` derived from the spec, and the SDK
 * validates `structuredContent` against it.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { FrontalClient } from "@/client.js";
import { HttpTransport } from "@/middlewares/http-transport.js";
import { SpecIndex } from "@/spec/index.js";
import { registerCuratedTool } from "@/tools/curated.js";
import { ANNOTATIONS } from "@/tools/policy.js";
import type { AdapterContext } from "@/tools/types.js";
import { createLogger } from "@/utils/logger.js";
import { getFreePort } from "../mocks/mock-edge.js";
import { connectHttp, type Harness, textOf } from "../utils/mcp-harness.js";

const DATASET_SCHEMA = {
  type: "object",
  required: ["id", "rows"],
  properties: { id: { type: "string" }, rows: { type: "integer" } },
};

const spec = new SpecIndex({
  openapi: "3.0.0",
  info: { title: "test", version: "0" },
  components: { schemas: { Dataset: DATASET_SCHEMA } },
  paths: {
    "/datasets/{dataset_id}": {
      get: {
        operationId: "getDataset",
        parameters: [{ name: "dataset_id", in: "path", required: true }],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Dataset" },
              },
            },
          },
        },
      },
    },
  },
} as unknown as ConstructorParameters<typeof SpecIndex>[0]);

/** What the fake API returns, by dataset id. */
const RESPONSES: Record<string, unknown> = {
  good: { id: "good", rows: 3 },
  bad: { id: "bad", rows: "three" },
};

describe.each(["legacy", "modern"] as const)(
  "typed structured output (%s)",
  (era) => {
    let transport: HttpTransport;
    let harness: Harness;

    beforeAll(async () => {
      const logger = createLogger({ level: "error" });
      const ctx: AdapterContext = {
        client: {
          request: (_method: string, path: string) =>
            Promise.resolve({ data: RESPONSES[path.split("/").at(-1) ?? ""] }),
        } as unknown as FrontalClient,
        spec,
        logger,
        config: { readOnly: false } as AdapterContext["config"],
        getToken: () => "frt_test",
      };

      transport = new HttpTransport(() => {
        const server = new McpServer({ name: "test", version: "0.0.0" });
        registerCuratedTool(server, ctx, {
          name: "get_dataset",
          title: "Get a dataset",
          description: "Fetch a dataset.",
          operationId: "getDataset",
          annotations: ANNOTATIONS.read,
          inputSchema: z.object({ dataset_id: z.string() }),
          map: (a) => ({ pathParams: { dataset_id: a.dataset_id as string } }),
        });
        return server;
      }, logger);
      const port = await getFreePort();
      await transport.start(port, "127.0.0.1");
      harness = await connectHttp(`http://127.0.0.1:${port}`, era);
    });

    afterAll(async () => {
      await harness?.close();
      await transport?.stop();
    });

    it("advertises the outputSchema derived from the spec", async () => {
      const { tools } = await harness.client.listTools();

      expect(tools[0].outputSchema).toMatchObject(DATASET_SCHEMA);
    });

    it("returns structuredContent that matches the schema, plus the JSON text", async () => {
      const result = await harness.client.callTool({
        name: "get_dataset",
        arguments: { dataset_id: "good" },
      });

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({ id: "good", rows: 3 });
      expect(JSON.parse(textOf(result))).toEqual({ id: "good", rows: 3 });
    });

    it("does not pass off a response that violates the schema as valid", async () => {
      const call = harness.client.callTool({
        name: "get_dataset",
        arguments: { dataset_id: "bad" },
      });

      // The SDK rejects it: either as a tool error or as a protocol error.
      const outcome = await call.then(
        (result) => ({
          isError: result.isError === true,
          text: textOf(result),
        }),
        (error: Error) => ({ isError: true, text: error.message })
      );
      expect(outcome.isError).toBe(true);
      expect(outcome.text.toLowerCase()).toMatch(/schema|valid/);
    });
  }
);
