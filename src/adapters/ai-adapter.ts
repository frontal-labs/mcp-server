import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "winston";
import type { ServerConfig } from "@/lib/server-config.js";
import {
  aiEmbedSchema,
  aiGenerateImageSchema,
  aiGenerateTextSchema,
} from "@/models/index.js";
import { FrontalApiClient } from "@/services/api-client.js";
import type { ServiceAdapter } from "./types.js";

export class AIAdapter implements ServiceAdapter {
  name = "ai";
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
      this.logger.info("AI Adapter initialized with API client");
    } else {
      this.logger.info("AI Adapter initialized (mock mode)");
    }
  }

  registerTools(server: McpServer): void {
    server.registerTool(
      "ai-generate-text",
      {
        title: "Generate Text",
        description: "Generate text using Frontal AI models",
        inputSchema: aiGenerateTextSchema,
      },
      async ({ model, prompt, maxTokens, temperature }) => {
        this.logger.info(`Generating text with model: ${model}`);

        if (this.apiClient) {
          try {
            const result = await this.apiClient.generateText({
              model,
              prompt,
              maxTokens,
              temperature,
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
            this.logger.error("Failed to generate text:", error);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error generating text: ${message}`,
                },
              ],
              isError: true,
            };
          }
        }

        const mockResponse = {
          text: `Generated text for prompt: "${prompt}" using model ${model}`,
          model,
          usage: {
            promptTokens: prompt.length,
            completionTokens: maxTokens || 100,
            totalTokens: prompt.length + (maxTokens || 100),
          },
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(mockResponse, null, 2),
            },
          ],
        };
      }
    );

    server.registerTool(
      "ai-generate-image",
      {
        title: "Generate Image",
        description: "Generate images using Frontal AI models",
        inputSchema: aiGenerateImageSchema,
      },
      async ({ prompt, size, quality }) => {
        this.logger.info(
          `Generating image: "${prompt.substring(0, 50)}..." at ${size ?? "default"} ${quality ?? "standard"}`
        );

        if (this.apiClient) {
          try {
            const result = await this.apiClient.generateImage({
              prompt,
              size,
              quality,
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
            this.logger.error("Failed to generate image:", error);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error generating image: ${message}`,
                },
              ],
              isError: true,
            };
          }
        }

        const mockResponse = {
          url: `https://api.frontal.dev/images/mock/${Date.now()}.png`,
          prompt,
          size: size ?? "512x512",
          quality: quality ?? "standard",
          created: new Date().toISOString(),
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(mockResponse, null, 2),
            },
          ],
        };
      }
    );

    server.registerTool(
      "ai-embed",
      {
        title: "Generate Embeddings",
        description: "Generate text embeddings",
        inputSchema: aiEmbedSchema,
      },
      async ({ text, model }) => {
        this.logger.info(
          `Generating embeddings for text length: ${text.length}`
        );

        if (this.apiClient) {
          try {
            const result = await this.apiClient.generateEmbeddings({
              text,
              model,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Generated ${result.embedding.length} dimensional embedding`,
                },
              ],
            };
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            this.logger.error("Failed to generate embeddings:", error);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error generating embeddings: ${message}`,
                },
              ],
              isError: true,
            };
          }
        }

        const mockResponse = {
          embedding: Array.from({ length: 1536 }, () => Math.random()),
          model: model ?? "text-embedding-ada-002",
          usage: {
            promptTokens: text.length,
            totalTokens: text.length,
          },
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Generated ${mockResponse.embedding.length} dimensional embedding`,
            },
          ],
        };
      }
    );
  }
}
