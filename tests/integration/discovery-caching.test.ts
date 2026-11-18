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
 * Discovery metadata and cache hints of protocol revision 2026-07-28.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VERSION } from "@/version.js";
import { type MockEdge, startMockEdge } from "../mocks/mock-edge.js";
import {
  connectHttp,
  type Harness,
  type HttpServerUnderTest,
  MODERN_PROTOCOL_VERSION,
  startHttpServer,
} from "../utils/mcp-harness.js";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

describe("discovery and caching (2026-07-28)", () => {
  let edge: MockEdge;
  let httpServer: HttpServerUnderTest;
  let modern: Harness;
  let legacy: Harness;

  beforeAll(async () => {
    edge = await startMockEdge();
    httpServer = await startHttpServer(edge);
    [modern, legacy] = await Promise.all([
      connectHttp(httpServer.url, "modern"),
      connectHttp(httpServer.url, "legacy"),
    ]);
  });

  afterAll(async () => {
    await Promise.allSettled([modern?.close(), legacy?.close()]);
    await httpServer?.stop();
    await edge?.close();
  });

  it("answers server/discover with the supported revision and capabilities", async () => {
    const discovered = await modern.client.discover();

    expect(discovered.supportedVersions).toContain(MODERN_PROTOCOL_VERSION);
    expect(discovered.capabilities.tools).toBeDefined();
    expect(discovered.instructions).toContain("generic, ontology, data");
    expect(discovered.instructions).toContain("https://docs.frontal.dev/");
  });

  it("identifies itself with name, version, enabled tool sets and a docs URL", () => {
    expect(modern.client.getServerVersion()).toMatchObject({
      name: "frontal-mcp-server",
      title: "Frontal",
      version: VERSION,
      websiteUrl: "https://docs.frontal.dev/",
    });
    expect(modern.client.getServerVersion()?.description).toContain(
      "generic, ontology, data"
    );
  });

  it("marks server/discover and tools/list as privately cacheable", async () => {
    const discovered = (await modern.client.discover()) as Record<
      string,
      unknown
    >;
    const listed = (await modern.client.listTools()) as Record<string, unknown>;

    for (const result of [discovered, listed]) {
      expect(result.ttlMs).toBe(FIVE_MINUTES_MS);
      expect(result.cacheScope).toBe("private");
    }
  });

  it("sends no cache fields to a 2025-era client", async () => {
    const listed = (await legacy.client.listTools()) as Record<string, unknown>;

    expect(listed.ttlMs).toBeUndefined();
    expect(listed.cacheScope).toBeUndefined();
  });
});
