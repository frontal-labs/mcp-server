import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "winston";
import type { ServerConfig } from "@/config/server-config.js";
import { blobListSchema, blobUploadSchema } from "@/models/index.js";
import { FrontalApiClient } from "@/services/api-client.js";
import type { ServiceAdapter } from "./types.js";

export class BlobAdapter implements ServiceAdapter {
  name = "blob";
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
      this.logger.info("Blob Adapter initialized with API client");
    } else {
      this.logger.info("Blob Adapter initialized (mock mode)");
    }
  }

  registerTools(server: McpServer): void {
    server.registerTool(
      "blob-upload",
      {
        title: "Upload File",
        description: "Upload file to Frontal blob storage",
        inputSchema: blobUploadSchema,
      },
      async ({ bucket, key, content, contentType }) => {
        this.logger.info(`Uploading to ${bucket}/${key}`);

        if (this.apiClient) {
          try {
            const result = await this.apiClient.uploadBlob({
              bucket,
              key,
              content,
              contentType,
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
            this.logger.error("Failed to upload blob:", error);
            return {
              content: [
                { type: "text" as const, text: `Error uploading: ${message}` },
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
                  bucket,
                  key,
                  url: `https://api.frontal.dev/blob/${bucket}/${key}`,
                  size: content.length,
                  contentType: contentType || "application/octet-stream",
                  etag: `mock-etag-${Date.now()}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    );

    server.registerTool(
      "blob-list",
      {
        title: "List Objects",
        description: "List objects in bucket",
        inputSchema: blobListSchema,
      },
      async ({ bucket, prefix, maxKeys }) => {
        this.logger.info(`Listing objects in ${bucket}`);

        if (this.apiClient) {
          try {
            const result = await this.apiClient.listBlobs({
              bucket,
              prefix,
              maxKeys,
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
            this.logger.error("Failed to list blobs:", error);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error listing objects: ${message}`,
                },
              ],
              isError: true,
            };
          }
        }

        const mockResponse = {
          objects: [
            {
              key: `${prefix || ""}file1.txt`,
              size: 1024,
              lastModified: new Date().toISOString(),
              etag: "mock-etag-1",
            },
            {
              key: `${prefix || ""}file2.txt`,
              size: 2048,
              lastModified: new Date().toISOString(),
              etag: "mock-etag-2",
            },
          ],
          truncated: false,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${mockResponse.objects.length} objects in ${bucket}`,
            },
          ],
        };
      }
    );
  }
}
