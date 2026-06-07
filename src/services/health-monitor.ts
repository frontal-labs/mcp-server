import type { Logger } from "winston";
import type { IncidentioConfig } from "@/config/server-config.js";
import {
  IncidentioClient,
  type IncidentioComponent,
} from "./incidentio-client.js";

export class HealthMonitor {
  private client: IncidentioClient | null = null;
  private config: IncidentioConfig;
  private logger: Logger;
  private statusPageId: string | null = null;
  private componentId: string | null = null;

  constructor(config: IncidentioConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;

    if (config.apiKey) {
      this.client = new IncidentioClient(config.apiKey, logger);
    }
  }

  get isConfigured(): boolean {
    return this.client?.isConfigured ?? false;
  }

  get statusPageUrl(): string | null {
    return this.config.statusPageUrl || null;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      this.logger.info(
        "incident.io integration not configured (missing API key), skipping"
      );
      return;
    }

    try {
      await this.resolveStatusPage();
      await this.resolveComponent();
      this.logger.info(
        `incident.io integration initialized (statusPage=${this.statusPageId}, component=${this.componentId})`
      );
    } catch (error) {
      this.logger.error(
        "Failed to initialize incident.io integration:",
        error
      );
    }
  }

  private async resolveStatusPage(): Promise<void> {
    if (this.config.statusPageId) {
      this.statusPageId = this.config.statusPageId;
      return;
    }

    if (!this.client) return;
    const pages = await this.client.listStatusPages();
    if (pages.length === 0) {
      throw new Error("No status pages found in incident.io");
    }

    this.statusPageId = pages[0].id;
    this.logger.info(
      `Auto-detected status page: ${pages[0].name} (${pages[0].id})`
    );
  }

  private async resolveComponent(): Promise<void> {
    if (!this.client || !this.statusPageId) return;
    const structure = await this.client.getStructure(this.statusPageId);

    if (this.config.componentId) {
      this.componentId = this.config.componentId;
      return;
    }

    const allComponents: IncidentioComponent[] = [
      ...(structure.components ?? []),
      ...(structure.groups?.flatMap((g) => g.components ?? []) ?? []),
    ];

    const match = allComponents.find((c) =>
      c.name.toLowerCase().includes("mcp")
    );

    if (match) {
      this.componentId = match.id;
      this.logger.info(
        `Auto-detected component: ${match.name} (${match.id})`
      );
      return;
    }

    if (allComponents.length > 0) {
      this.componentId = allComponents[0].id;
      this.logger.info(
        `Using first available component: ${allComponents[0].name} (${allComponents[0].id})`
      );
    }
  }

  /**
   * Checks the Widget API (public, unauthenticated) and resolves any
   * active incidents. Called at server startup to clear lingering
   * incidents from a prior outage.
   */
  async reportOperational(): Promise<void> {
    if (!this.client || !this.statusPageId || !this.config.statusPageUrl) {
      return;
    }

    try {
      const summary = await IncidentioClient.fetchWidgetSummary(
        this.config.statusPageUrl
      );

      if (summary.ongoing_incidents.length === 0) {
        this.logger.info(
          "Widget API reports no active incidents, status page is clear"
        );
        return;
      }

      // Only resolve MCP Server incidents, leave other incidents alone
      const mcpIncidents = summary.ongoing_incidents.filter((i) =>
        i.name.startsWith("MCP Server")
      );

      if (mcpIncidents.length === 0) {
        this.logger.info(
          "Widget API reports active incidents but none are MCP Server, skipping"
        );
        return;
      }

      this.logger.info(
        `Resolving ${mcpIncidents.length} MCP Server incident(s) via Management API`
      );

      for (const incident of mcpIncidents) {
        await this.client.resolveIncident(
          incident.id,
          "MCP server recovered — health check passing."
        );
        this.logger.info(
          `Resolved active incident ${incident.id} ("${incident.name}") after server recovery`
        );
      }
    } catch (error) {
      this.logger.error(
        "Failed to resolve incidents via incident.io:",
        error
      );
    }
  }

  getComponentId(): string | null {
    return this.componentId;
  }

  getStatusPageId(): string | null {
    return this.statusPageId;
  }
}
