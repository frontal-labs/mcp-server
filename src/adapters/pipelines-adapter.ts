import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "winston";
import type { ServerConfig } from "@/lib/server-config.js";
import { pipelinesCreateSchema, pipelinesRunSchema } from "@/models/index.js";
import { FrontalApiClient } from "@/services/api-client.js";
import type { ServiceAdapter } from "./types.js";

export class PipelinesAdapter implements ServiceAdapter {
  name = "pipelines";
  private logger!: Logger;
  private apiClient: FrontalApiClient | undefined;

  async initialize(config: ServerConfig, logger: Logger): Promise<void> {
    this.logger = logger;

    if (config.apiKey) {
      this.apiClient = new FrontalApiClient(
        config.baseUrl,
        config.apiKey,
        logger,
        { maxAttempts: 3, baseDelay: 1000, maxDelay: 5000 }
      );
      this.logger.info("Pipelines Adapter initialized with API client");
    } else {
      this.logger.info("Pipelines Adapter initialized (mock mode)");
    }
  }

  registerTools(server: McpServer): void {
    server.registerTool(
      "pipelines-create",
      {
        title: "Create Pipeline",
        description: "Create new pipeline",
        inputSchema: pipelinesCreateSchema,
      },
      async ({ name, description, steps }) => {
        this.logger.info(`Creating pipeline: ${name}`);

        if (this.apiClient) {
          try {
            const result = await this.apiClient.createPipeline({
              name,
              description,
              steps: steps as Record<string, unknown>[],
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            this.logger.error("Failed to create pipeline:", error);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error creating pipeline: ${message}`,
                },
              ],
              isError: true,
            };
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  pipelineId: `pipeline_${Date.now()}`,
                  name,
                  description,
                  steps,
                  status: "created",
                  created: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    server.registerTool(
      "pipelines-run",
      {
        title: "Run Pipeline",
        description: "Execute pipeline",
        inputSchema: pipelinesRunSchema,
      },
      async ({ pipelineId, input }) => {
        this.logger.info(`Running pipeline: ${pipelineId}`);

        if (this.apiClient) {
          try {
            const result = await this.apiClient.runPipeline({
              pipelineId,
              input: input as Record<string, unknown> | undefined,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            this.logger.error("Failed to run pipeline:", error);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error running pipeline: ${message}`,
                },
              ],
              isError: true,
            };
          }
        }

        const mockResponse = {
          runId: `run_${Date.now()}`,
          pipelineId,
          status: "running",
          started: new Date().toISOString(),
          input: input || {},
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Started pipeline run: ${mockResponse.runId}`,
            },
          ],
        };
      }
    );
  }
}
