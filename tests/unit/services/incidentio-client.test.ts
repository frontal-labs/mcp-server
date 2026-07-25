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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IncidentioApiError,
  IncidentioClient,
} from "@/services/incidentio-client.js";
import { createLogger } from "@/utils/logger.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const incident = {
  id: "inc_1",
  name: "MCP Server outage",
  incident_status: "investigating",
  status_page_id: "sp_1",
};

describe("IncidentioClient", () => {
  const logger = createLogger({ level: "error" });
  let client: IncidentioClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    client = new IncidentioClient("inc_key", logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports configured state", () => {
    expect(client.isConfigured).toBe(true);
    expect(new IncidentioClient("", logger).isConfigured).toBe(false);
  });

  it("lists status pages", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ status_pages: [{ id: "sp_1", name: "Frontal" }] })
    );
    const pages = await client.listStatusPages();
    expect(pages).toHaveLength(1);
    expect(mockFetch.mock.calls[0][0]).toContain("/v2/status_pages");
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer inc_key"
    );
  });

  it("gets structure with components and groups defaulted", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ components: [{ id: "c1", name: "MCP" }] })
    );
    const structure = await client.getStructure("sp_1");
    expect(structure.components).toHaveLength(1);
    expect(structure.groups).toEqual([]);
  });

  it("creates an incident", async () => {
    mockFetch.mockResolvedValue(jsonResponse(incident));
    const result = await client.createIncident({
      statusPageId: "sp_1",
      incidentStatus: "investigating",
      name: "MCP Server outage",
      message: "down",
      componentStatuses: [
        { componentId: "c1", componentStatus: "full_outage" },
      ],
    });
    expect(result.id).toBe("inc_1");
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
  });

  it("lists and filters active incidents", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        status_page_incidents: [
          incident,
          { ...incident, id: "inc_2", incident_status: "resolved" },
        ],
      })
    );
    const active = await client.findActiveIncidents("sp_1");
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("inc_1");
  });

  it("resolves an incident via PATCH", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ ...incident, incident_status: "resolved" })
    );
    const result = await client.resolveIncident("inc_1", "recovered");
    expect(result.incident_status).toBe("resolved");
    expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
  });

  it("throws a retryable IncidentioApiError on 5xx", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "boom" }, 503));
    await expect(client.listStatusPages()).rejects.toBeInstanceOf(
      IncidentioApiError
    );
    try {
      await client.listStatusPages();
    } catch (error) {
      expect((error as IncidentioApiError).retryable).toBe(true);
      expect((error as IncidentioApiError).statusCode).toBe(503);
    }
  });

  it("fetches the public widget summary", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        page_title: "Frontal",
        page_url: "https://frontal-status.com",
        ongoing_incidents: [],
        in_progress_maintenances: [],
        scheduled_maintenances: [],
      })
    );
    const summary = await IncidentioClient.fetchWidgetSummary(
      "https://frontal-status.com/"
    );
    expect(summary.ongoing_incidents).toEqual([]);
    expect(IncidentioClient.hasActiveIncidents(summary)).toBe(false);
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://frontal-status.com/api/v1/summary"
    );
  });
});
