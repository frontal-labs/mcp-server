import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "winston";
import type { ServerConfig } from "@/lib/server-config.js";
import { graphCreateNodeSchema, graphQuerySchema } from "@/models/index.js";
import { FrontalApiClient } from "@/services/api-client.js";
import type { ServiceAdapter } from "./types.js";

export class GraphAdapter implements ServiceAdapter {
  name = "graph";
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
      this.logger.info("Graph Adapter initialized with API client");
    } else {
      this.logger.info("Graph Adapter initialized (mock mode)");
    }
  }

  registerTools(server: McpServer): void {
    server.registerTool(
      "graph-query",
      {
        title: "Query Graph",
        description: "Execute graph queries",
        inputSchema: graphQuerySchema,
      },
      async ({ query, variables }) => {
        this.logger.info("Executing graph query");

        if (this.apiClient) {
          try {
            const result = await this.apiClient.queryGraph({
              query,
              variables: variables as Record<string, unknown> | undefined,
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
            this.logger.error("Failed to execute graph query:", error);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error executing query: ${message}`,
                },
              ],
              isError: true,
            };
          }
        }

        const mockResponse = {
          data: {
            nodes: [
              { id: "node1", type: "User", properties: { name: "Alice" } },
              { id: "node2", type: "User", properties: { name: "Bob" } },
            ],
            edges: [{ from: "node1", to: "node2", type: "KNOWS" }],
          },
          executionTime: 45,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Query executed, found ${mockResponse.data.nodes.length} nodes and ${mockResponse.data.edges.length} edges`,
            },
          ],
        };
      }
    );

    server.registerTool(
      "graph-create-node",
      {
        title: "Create Node",
        description: "Create graph node",
        inputSchema: graphCreateNodeSchema,
      },
      async ({ type, properties }) => {
        this.logger.info(`Creating ${type} node`);

        if (this.apiClient) {
          try {
            const result = await this.apiClient.createNode({
              type,
              properties: properties as Record<string, unknown>,
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
            this.logger.error("Failed to create node:", error);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error creating node: ${message}`,
                },
              ],
              isError: true,
            };
          }
        }

        const mockResponse = {
          nodeId: `node_${Date.now()}`,
          type,
          properties,
          created: new Date().toISOString(),
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Created ${type} node with ID: ${mockResponse.nodeId}`,
            },
          ],
        };
      }
    );
  }
}
