import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "winston";
import type { ServerConfig } from "@/lib/server-config.js";
import { functionsInvokeSchema, functionsListSchema } from "@/models/index.js";
import { FrontalApiClient } from "@/services/api-client.js";
import type { ServiceAdapter } from "./types.js";

export class FunctionsAdapter implements ServiceAdapter {
  name = "functions";
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
      this.logger.info("Functions Adapter initialized with API client");
    } else {
      this.logger.info("Functions Adapter initialized (mock mode)");
    }
  }

  registerTools(server: McpServer): void {
    server.registerTool(
      "functions-invoke",
      {
        title: "Invoke Function",
        description: "Invoke a Frontal serverless function",
        inputSchema: functionsInvokeSchema,
      },
      async ({ name, payload, invokeAsync }) => {
        this.logger.info(`Invoking function: ${name}`);

        if (this.apiClient) {
          try {
            const result = await this.apiClient.invokeFunction({
              name,
              payload: payload as Record<string, unknown>,
              invokeAsync,
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
            this.logger.error("Failed to invoke function:", error);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error invoking function: ${message}`,
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
                  functionId: `func_${Date.now()}`,
                  name,
                  status: invokeAsync ? "pending" : "completed",
                  result: invokeAsync
                    ? null
                    : {
                        message: "Function executed successfully",
                        data: payload,
                      },
                  executionTime: invokeAsync ? null : 150,
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
      "functions-list",
      {
        title: "List Functions",
        description: "List deployed functions",
        inputSchema: functionsListSchema,
      },
      async ({ status }) => {
        this.logger.info(`Listing functions with status: ${status}`);

        if (this.apiClient) {
          try {
            const result = await this.apiClient.listFunctions({ status });
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
            this.logger.error("Failed to list functions:", error);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error listing functions: ${message}`,
                },
              ],
              isError: true,
            };
          }
        }

        const mockResponse = {
          functions: [
            {
              id: "func_1",
              name: "process-data",
              status: "active",
              runtime: "nodejs18",
              memory: 256,
              timeout: 30,
              created: new Date().toISOString(),
            },
            {
              id: "func_2",
              name: "send-email",
              status: "active",
              runtime: "python3.9",
              memory: 128,
              timeout: 15,
              created: new Date().toISOString(),
            },
          ],
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${mockResponse.functions.length} functions`,
            },
          ],
        };
      }
    );
  }
}
