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
import type { IncidentioConfig } from "@/lib/server-config.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HealthMonitor } from "@/services/health-monitor.js";
import { createLogger } from "@/utils/logger.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const logger = createLogger({ level: "error" });

function config(overrides: Partial<IncidentioConfig> = {}): IncidentioConfig {
  return {
    apiKey: "inc_key",
    statusPageId: "",
    statusPageUrl: "https://frontal-status.com",
    componentId: "",
    ...overrides,
  };
}

describe("HealthMonitor", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is not configured without an API key", () => {
    const monitor = new HealthMonitor(config({ apiKey: "" }), logger);
    expect(monitor.isConfigured).toBe(false);
  });

  it("skips initialization gracefully when unconfigured", async () => {
    const monitor = new HealthMonitor(config({ apiKey: "" }), logger);
    await expect(monitor.initialize()).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("auto-detects status page and MCP component on initialize", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({ status_pages: [{ id: "sp_1", name: "Frontal" }] })
      )
      .mockResolvedValueOnce(
        jsonResponse({ components: [{ id: "c_mcp", name: "MCP Server" }] })
      );
    const monitor = new HealthMonitor(config(), logger);
    await monitor.initialize();
    expect(monitor.getStatusPageId()).toBe("sp_1");
    expect(monitor.getComponentId()).toBe("c_mcp");
  });

  it("uses configured ids without hitting the API to resolve them", async () => {
    const monitor = new HealthMonitor(
      config({ statusPageId: "sp_x", componentId: "c_x" }),
      logger
    );
    await monitor.initialize();
    expect(monitor.getStatusPageId()).toBe("sp_x");
    expect(monitor.getComponentId()).toBe("c_x");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("resolves lingering MCP incidents on reportOperational", async () => {
    const monitor = new HealthMonitor(
      config({ statusPageId: "sp_1", componentId: "c_1" }),
      logger
    );
    await monitor.initialize();

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          page_title: "Frontal",
          page_url: "https://frontal-status.com",
          ongoing_incidents: [
            {
              id: "inc_1",
              name: "MCP Server outage",
              status: "investigating",
              url: "https://frontal-status.com/i/1",
              last_update_at: "2026-07-24T00:00:00Z",
              last_update_message: "down",
              current_worst_impact: "full_outage",
              affected_components: [],
            },
          ],
          in_progress_maintenances: [],
          scheduled_maintenances: [],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "inc_1",
          name: "MCP Server outage",
          incident_status: "resolved",
          status_page_id: "sp_1",
        })
      );

    await monitor.reportOperational();
    // Second call is the PATCH that resolves the incident.
    expect(mockFetch.mock.calls[1][1].method).toBe("PATCH");
  });

  it("does nothing on reportOperational when there are no incidents", async () => {
    const monitor = new HealthMonitor(
      config({ statusPageId: "sp_1", componentId: "c_1" }),
      logger
    );
    await monitor.initialize();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        page_title: "Frontal",
        page_url: "https://frontal-status.com",
        ongoing_incidents: [],
        in_progress_maintenances: [],
        scheduled_maintenances: [],
      })
    );
    await expect(monitor.reportOperational()).resolves.toBeUndefined();
  });
});
