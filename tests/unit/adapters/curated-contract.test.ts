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
import { describe, expect, it, vi } from "vitest";
import { DataAdapter } from "@/adapters/data-adapter.js";
import { GenericAdapter } from "@/adapters/generic-adapter.js";
import { OntologyAdapter } from "@/adapters/ontology-adapter.js";
import type { AdapterContext } from "@/adapters/types.js";
import type { FrontalClient } from "@/clients/frontal-client.js";
import { loadSpecIndex } from "@/spec/spec-index.js";
import { createLogger } from "@/utils/logger.js";

function makeHarness() {
  const registered: string[] = [];
  const server = {
    registerTool: (name: string) => {
      registered.push(name);
    },
  } as unknown as McpServer;

  const logger = createLogger({ level: "error" });
  const warnSpy = vi.spyOn(logger, "warn");

  const ctx: AdapterContext = {
    client: {} as FrontalClient,
    spec: loadSpecIndex(),
    logger,
    config: {} as AdapterContext["config"],
    getToken: () => "frt_test",
  };

  return { registered, server, ctx, warnSpy };
}

describe("curated tool spec-drift contract", () => {
  it("registers every ontology tool against a real operation (no drift)", () => {
    const { registered, server, ctx, warnSpy } = makeHarness();
    new OntologyAdapter().register(server, ctx);
    expect(registered.length).toBeGreaterThan(0);
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes("Skipping curated"))
    ).toBe(false);
  });

  it("registers every data tool against a real operation (no drift)", () => {
    const { registered, server, ctx, warnSpy } = makeHarness();
    new DataAdapter().register(server, ctx);
    expect(registered.length).toBeGreaterThan(0);
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes("Skipping curated"))
    ).toBe(false);
  });

  it("registers the three generic meta-tools", () => {
    const { registered, server, ctx } = makeHarness();
    new GenericAdapter().register(server, ctx);
    expect(registered).toEqual([
      "frontal_list_endpoints",
      "frontal_describe_endpoint",
      "frontal_call_endpoint",
    ]);
  });
});
