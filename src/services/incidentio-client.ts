import { randomUUID } from "node:crypto";
import type { Logger } from "winston";
import { z } from "zod";

const INCIDENTIO_BASE_URL = "https://api.incident.io";

// --- Widget API (public, unauthenticated) ---

const widgetComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  group_name: z.string().optional(),
  current_status: z.enum([
    "operational",
    "degraded_performance",
    "partial_outage",
    "full_outage",
  ]),
});

const widgetIncidentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["investigating", "identified", "monitoring"]),
  url: z.string(),
  last_update_at: z.string(),
  last_update_message: z.string(),
  current_worst_impact: z.enum([
    "degraded_performance",
    "partial_outage",
    "full_outage",
  ]),
  affected_components: z.array(widgetComponentSchema),
});

const widgetMaintenanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["maintenance_in_progress", "maintenance_scheduled"]),
  last_update_at: z.string(),
  last_update_message: z.string(),
  url: z.string(),
  affected_components: z.array(widgetComponentSchema),
  started_at: z.string().optional(),
  scheduled_end_at: z.string().optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
});

const widgetSummarySchema = z.object({
  page_title: z.string(),
  page_url: z.string(),
  ongoing_incidents: z.array(widgetIncidentSchema),
  in_progress_maintenances: z.array(widgetMaintenanceSchema),
  scheduled_maintenances: z.array(widgetMaintenanceSchema),
});

export type WidgetSummary = z.infer<typeof widgetSummarySchema>;
export type WidgetIncident = z.infer<typeof widgetIncidentSchema>;
export type WidgetMaintenance = z.infer<typeof widgetMaintenanceSchema>;
export type WidgetComponent = z.infer<typeof widgetComponentSchema>;

// --- Management API (authenticated) ---

const statusPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().optional(),
});

const componentStatusSchema = z.enum([
  "operational",
  "degraded_performance",
  "partial_outage",
  "major_outage",
]);

const componentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: componentStatusSchema.optional(),
});

const statusPageStructureSchema = z.object({
  components: z.array(componentSchema).optional(),
  groups: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        components: z.array(componentSchema).optional(),
      })
    )
    .optional(),
});

const incidentStatusSchema = z.enum([
  "investigating",
  "identified",
  "monitoring",
  "resolved",
]);

const statusPageIncidentSchema = z.object({
  id: z.string(),
  name: z.string(),
  incident_status: incidentStatusSchema,
  status_page_id: z.string(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const listStatusPagesResponseSchema = z.object({
  status_pages: z.array(statusPageSchema),
});

const listIncidentsResponseSchema = z.object({
  status_page_incidents: z.array(statusPageIncidentSchema),
});

// --- Types ---

export type ComponentStatus = z.infer<typeof componentStatusSchema>;
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;
export type IncidentioStatusPage = z.infer<typeof statusPageSchema>;
export type IncidentioComponent = z.infer<typeof componentSchema>;
export type IncidentioStatusPageIncident = z.infer<
  typeof statusPageIncidentSchema
>;

export interface CreateIncidentParams {
  statusPageId: string;
  name: string;
  message: string;
  incidentStatus: IncidentStatus;
  componentStatuses: Array<{
    componentId: string;
    componentStatus: ComponentStatus;
  }>;
  notifySubscribers?: boolean;
}

export interface UpdateIncidentParams {
  incidentStatus?: IncidentStatus;
  componentStatuses?: Array<{
    componentId: string;
    componentStatus: ComponentStatus;
  }>;
  message?: string;
  notifySubscribers?: boolean;
}

export class IncidentioApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "IncidentioApiError";
  }
}

export class IncidentioClient {
  private apiKey: string;
  private logger: Logger;

  constructor(apiKey: string, logger: Logger) {
    this.apiKey = apiKey;
    this.logger = logger;
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  // --- Widget API (public, unauthenticated) ---

  static async fetchWidgetSummary(
    statusPageUrl: string
  ): Promise<WidgetSummary> {
    const url = `${statusPageUrl.replace(/\/$/, "")}/api/v1/summary`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Widget API error ${response.status}: ${response.statusText}`
      );
    }
    const data: unknown = await response.json();
    return widgetSummarySchema.parse(data);
  }

  static hasActiveIncidents(summary: WidgetSummary): boolean {
    return summary.ongoing_incidents.length > 0;
  }

  // --- Management API (authenticated) ---

  private async request<T>(
    path: string,
    options: {
      method: string;
      body?: unknown;
      schema: z.ZodType<T>;
    }
  ): Promise<T> {
    const url = `${INCIDENTIO_BASE_URL}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "Idempotency-Key": randomUUID(),
    };

    this.logger.debug(`incident.io ${options.method} ${path}`);

    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const retryable = response.status >= 500 || response.status === 429;
      throw new IncidentioApiError(
        `incident.io API error ${response.status}: ${text}`,
        response.status,
        retryable
      );
    }

    const data: unknown = await response.json();
    return options.schema.parse(data);
  }

  // --- Status Pages ---

  async listStatusPages(): Promise<IncidentioStatusPage[]> {
    const result = await this.request("/v2/status_pages", {
      method: "GET",
      schema: listStatusPagesResponseSchema,
    });
    return result.status_pages;
  }

  async getStructure(statusPageId: string): Promise<{
    components: IncidentioComponent[];
    groups: Array<{
      id: string;
      name: string;
      components?: IncidentioComponent[];
    }>;
  }> {
    const result = await this.request(
      `/v2/status_pages/${encodeURIComponent(statusPageId)}/structure`,
      { method: "GET", schema: statusPageStructureSchema }
    );
    return {
      components: result.components ?? [],
      groups: result.groups ?? [],
    };
  }

  // --- Incidents ---

  async createIncident(
    params: CreateIncidentParams
  ): Promise<IncidentioStatusPageIncident> {
    const body = {
      status_page_id: params.statusPageId,
      incident_status: params.incidentStatus,
      name: params.name,
      message: params.message,
      component_statuses: params.componentStatuses.map((cs) => ({
        component_id: cs.componentId,
        component_status: cs.componentStatus,
      })),
      notify_subscribers: params.notifySubscribers ?? true,
    };

    return this.request("/v2/status_page_incidents", {
      method: "POST",
      body,
      schema: statusPageIncidentSchema,
    });
  }

  async listIncidents(
    statusPageId: string
  ): Promise<IncidentioStatusPageIncident[]> {
    const result = await this.request(
      `/v2/status_page_incidents?status_page_id=${encodeURIComponent(statusPageId)}`,
      { method: "GET", schema: listIncidentsResponseSchema }
    );
    return result.status_page_incidents;
  }

  async getIncident(incidentId: string): Promise<IncidentioStatusPageIncident> {
    return this.request(
      `/v2/status_page_incidents/${encodeURIComponent(incidentId)}`,
      { method: "GET", schema: statusPageIncidentSchema }
    );
  }

  async updateIncident(
    incidentId: string,
    params: UpdateIncidentParams
  ): Promise<IncidentioStatusPageIncident> {
    const body: Record<string, unknown> = {};

    if (params.incidentStatus) {
      body.incident_status = params.incidentStatus;
    }
    if (params.componentStatuses) {
      body.component_statuses = params.componentStatuses.map((cs) => ({
        component_id: cs.componentId,
        component_status: cs.componentStatus,
      }));
    }
    if (params.notifySubscribers !== undefined) {
      body.notify_subscribers = params.notifySubscribers;
    }

    return this.request(
      `/v2/status_page_incidents/${encodeURIComponent(incidentId)}`,
      {
        method: "PATCH",
        body,
        schema: statusPageIncidentSchema,
      }
    );
  }

  async resolveIncident(
    incidentId: string,
    message?: string
  ): Promise<IncidentioStatusPageIncident> {
    return this.updateIncident(incidentId, {
      incidentStatus: "resolved",
      message: message ?? "Issue resolved. Service is operational.",
      notifySubscribers: true,
    });
  }

  async findActiveIncidents(
    statusPageId: string
  ): Promise<IncidentioStatusPageIncident[]> {
    const incidents = await this.listIncidents(statusPageId);
    return incidents.filter((i) => i.incident_status !== "resolved");
  }
}
