import { randomUUID } from "node:crypto";
import type { Logger } from "winston";
import { z } from "zod";
import type {
  CreateNodeOptions,
  CreateNodeResponse,
  CreatePipelineOptions,
  GenerateEmbeddingsOptions,
  GenerateEmbeddingsResponse,
  GenerateImageOptions,
  GenerateImageResponse,
  GenerateTextOptions,
  GenerateTextResponse,
  GraphQueryOptions,
  GraphQueryResponse,
  InvokeOptions,
  InvokeResponse,
  ListFunctionsOptions,
  ListFunctionsResponse,
  ListOptions,
  ListResponse,
  PipelineInfo,
  RunPipelineOptions,
  RunPipelineResponse,
  UploadOptions,
  UploadResponse,
} from "@/interfaces/index.js";
import {
  createNodeResponseSchema,
  createPipelineResponseSchema,
  generateEmbeddingsResponseSchema,
  generateImageResponseSchema,
  generateTextResponseSchema,
  graphQueryResponseSchema,
  invokeResponseSchema,
  listBlobResponseSchema,
  listFunctionsResponseSchema,
  runPipelineResponseSchema,
  uploadResponseSchema,
} from "@/models/index.js";

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
}

export interface ServiceContext {
  service: string;
  operation: string;
  requestId?: string;
}

export interface ErrorContext {
  service: string;
  operation: string;
  requestId?: string;
  originalError?: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public retryable: boolean = false,
    public context?: ErrorContext
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class FrontalApiClient {
  private baseUrl: string;
  private apiKey: string;
  private logger: Logger;
  private retryConfig: RetryConfig;

  constructor(
    baseUrl: string,
    apiKey: string,
    logger: Logger,
    retryConfig: Partial<RetryConfig> = {}
  ) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.logger = logger;
    this.retryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      jitter: true,
      ...retryConfig,
    };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateDelay(attempt: number): number {
    const delay = this.retryConfig.baseDelay * 2 ** (attempt - 1);
    const jitter = this.retryConfig.jitter ? Math.random() * 0.1 * delay : 0;
    return Math.min(delay + jitter, this.retryConfig.maxDelay);
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof ApiError) {
      return error.retryable;
    }
    if (error instanceof Error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ECONNRESET" || code === "ETIMEDOUT") {
        return true;
      }
    }
    return false;
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ServiceContext
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        this.logger.debug(
          `Executing ${context.operation} (attempt ${attempt}/${this.retryConfig.maxAttempts})`
        );
        const result = await operation();
        this.logger.debug(
          `Successfully completed ${context.operation} on attempt ${attempt}`
        );
        return result;
      } catch (error: unknown) {
        lastError = error;

        if (
          attempt === this.retryConfig.maxAttempts ||
          !this.isRetryableError(error)
        ) {
          this.logger.error(
            `Failed ${context.operation} after ${attempt} attempts:`,
            error
          );
          throw this.enhanceError(error, context);
        }

        const delay = this.calculateDelay(attempt);
        this.logger.warn(
          `Attempt ${attempt} failed for ${context.operation}, retrying in ${delay}ms`
        );
        await this.sleep(delay);
      }
    }

    throw this.enhanceError(lastError, context);
  }

  private enhanceError(error: unknown, context: ServiceContext): ApiError {
    if (error instanceof ApiError) {
      return error;
    }

    const message =
      error instanceof Error ? error.message : "Unknown API error";
    const statusCode = 500;
    const retryable = this.isRetryableError(error);
    const code =
      error instanceof Error
        ? (error as NodeJS.ErrnoException).code
        : undefined;

    return new ApiError(message, statusCode, code, retryable, {
      service: context.service,
      operation: context.operation,
      requestId: context.requestId,
      originalError: error,
    });
  }

  private async request<T>(
    path: string,
    options: {
      method: string;
      body?: unknown;
      schema: z.ZodType<T>;
    },
    context: ServiceContext
  ): Promise<T> {
    return this.executeWithRetry(async () => {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "X-Request-ID": context.requestId || randomUUID(),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        throw new ApiError(
          `Request failed: ${response.statusText}`,
          response.status,
          undefined,
          response.status >= 500
        );
      }

      const data: unknown = await response.json();
      return options.schema.parse(data);
    }, context);
  }

  // --- AI Operations ---

  async generateText(
    options: GenerateTextOptions
  ): Promise<GenerateTextResponse> {
    return this.request(
      "/ai/generate-text",
      { method: "POST", body: options, schema: generateTextResponseSchema },
      { service: "ai", operation: "generate-text", requestId: randomUUID() }
    );
  }

  async generateImage(
    options: GenerateImageOptions
  ): Promise<GenerateImageResponse> {
    return this.request(
      "/ai/generate-image",
      { method: "POST", body: options, schema: generateImageResponseSchema },
      { service: "ai", operation: "generate-image", requestId: randomUUID() }
    );
  }

  async generateEmbeddings(
    options: GenerateEmbeddingsOptions
  ): Promise<GenerateEmbeddingsResponse> {
    return this.request(
      "/ai/embed",
      {
        method: "POST",
        body: options,
        schema: generateEmbeddingsResponseSchema,
      },
      {
        service: "ai",
        operation: "generate-embeddings",
        requestId: randomUUID(),
      }
    );
  }

  // --- Blob Operations ---

  async uploadBlob(options: UploadOptions): Promise<UploadResponse> {
    return this.request(
      "/blob/upload",
      { method: "POST", body: options, schema: uploadResponseSchema },
      { service: "blob", operation: "upload", requestId: randomUUID() }
    );
  }

  async listBlobs(options: ListOptions): Promise<ListResponse> {
    return this.request(
      `/blob/list?bucket=${encodeURIComponent(options.bucket)}${options.prefix ? `&prefix=${encodeURIComponent(options.prefix)}` : ""}${options.maxKeys ? `&maxKeys=${options.maxKeys}` : ""}`,
      { method: "GET", schema: listBlobResponseSchema },
      { service: "blob", operation: "list", requestId: randomUUID() }
    );
  }

  async deleteBlob(bucket: string, key: string): Promise<{ success: boolean }> {
    return this.request(
      "/blob/delete",
      {
        method: "POST",
        body: { bucket, key },
        schema: z.object({ success: z.boolean() }),
      },
      { service: "blob", operation: "delete", requestId: randomUUID() }
    );
  }

  // --- Functions Operations ---

  async invokeFunction(options: InvokeOptions): Promise<InvokeResponse> {
    return this.request(
      "/functions/invoke",
      { method: "POST", body: options, schema: invokeResponseSchema },
      {
        service: "functions",
        operation: "invoke",
        requestId: randomUUID(),
      }
    );
  }

  async listFunctions(
    options: ListFunctionsOptions
  ): Promise<ListFunctionsResponse> {
    return this.request(
      `/functions/list${options.status ? `?status=${encodeURIComponent(options.status)}` : ""}`,
      { method: "GET", schema: listFunctionsResponseSchema },
      { service: "functions", operation: "list", requestId: randomUUID() }
    );
  }

  // --- Graph Operations ---

  async queryGraph(options: GraphQueryOptions): Promise<GraphQueryResponse> {
    return this.request(
      "/graph/query",
      { method: "POST", body: options, schema: graphQueryResponseSchema },
      { service: "graph", operation: "query", requestId: randomUUID() }
    );
  }

  async createNode(options: CreateNodeOptions): Promise<CreateNodeResponse> {
    return this.request(
      "/graph/nodes",
      { method: "POST", body: options, schema: createNodeResponseSchema },
      { service: "graph", operation: "create-node", requestId: randomUUID() }
    );
  }

  // --- Pipelines Operations ---

  async createPipeline(options: CreatePipelineOptions): Promise<PipelineInfo> {
    return this.request(
      "/pipelines",
      { method: "POST", body: options, schema: createPipelineResponseSchema },
      {
        service: "pipelines",
        operation: "create",
        requestId: randomUUID(),
      }
    );
  }

  async runPipeline(options: RunPipelineOptions): Promise<RunPipelineResponse> {
    return this.request(
      `/pipelines/${encodeURIComponent(options.pipelineId)}/run`,
      {
        method: "POST",
        body: { input: options.input },
        schema: runPipelineResponseSchema,
      },
      { service: "pipelines", operation: "run", requestId: randomUUID() }
    );
  }
}
