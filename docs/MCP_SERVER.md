# Frontal MCP Server Implementation

## Overview

This document details the Model Context Protocol (MCP) server implementation for Frontal services. It covers the server architecture, protocol handling, transport mechanisms, and integration patterns.

## MCP Protocol Basics

The Model Context Protocol enables AI assistants to interact with external tools and services through a standardized interface. The Frontal MCP Server implements this protocol to provide access to Frontal's cloud services.

### Core Concepts

- **Tools**: Functions that AI assistants can invoke (e.g., text generation, file upload)
- **Resources**: Data sources that can be read (e.g., files, database records)
- **Prompts**: Reusable prompt templates
- **Transport**: Communication layer (stdio, HTTP)

## Server Architecture

### Main Components

```
FrontalMcpServer
├── Adapters (Service-specific)
│   ├── AIAdapter
│   ├── BlobAdapter
│   ├── FunctionsAdapter
│   ├── GraphAdapter
│   └── PipelinesAdapter
├── Transport Layer
│   ├── StdioTransport
│   └── HttpTransport
├── Configuration
└── Logging
```

### Class Hierarchy

```typescript
// Main server class
export class FrontalMcpServer {
  private server: McpServer;
  private adapters: Map<string, ServiceAdapter>;
  private config: ServerConfig;
  private logger: Logger;
}

// Base adapter interface
export interface ServiceAdapter {
  name: string;
  initialize(config: ServerConfig, logger: Logger): Promise<void>;
  registerTools(server: McpServer): void;
  registerResources?(server: McpServer): void;
  registerPrompts?(server: McpServer): void;
}
```

## Transport Mechanisms

### Stdio Transport

The stdio transport uses standard input/output for communication, ideal for local AI assistants.

```typescript
// Implementation
async connectStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await this.server.connect(transport);
  this.logger.info("Connected via stdio transport");
}
```

**Usage:**
```bash
frontal-mcp-server --transport stdio
```

**Message Format:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "ai-generate-text",
    "arguments": {
      "model": "frontal-gpt-4",
      "prompt": "Hello world"
    }
  },
  "id": 1
}
```

### HTTP Transport

The HTTP transport provides a REST API interface for remote integration.

```typescript
// Implementation
async connectHttp(): Promise<void> {
  const transport = new EnhancedHttpTransport(
    this.config.http.port,
    this.config.http.host
  );
  await this.server.connect(transport);
  this.logger.info(`Connected via HTTP transport on ${this.config.http.host}:${this.config.http.port}`);
}
```

**Usage:**
```bash
frontal-mcp-server --transport http --port 3000
```

**Endpoints:**
- `POST /tools/call` - Execute a tool
- `GET /tools/list` - List available tools
- `GET /resources/list` - List available resources
- `POST /resources/read` - Read a resource

## Service Adapters

### AI Adapter

Provides access to Frontal's AI services including text generation, image generation, and embeddings.

```typescript
export class AIAdapter implements ServiceAdapter {
  name = "ai";
  
  registerTools(server: McpServer): void {
    server.registerTool(
      "ai-generate-text",
      {
        title: "Generate Text",
        description: "Generate text using Frontal AI models",
        inputSchema: aiGenerateTextSchema,
      },
      this.handleGenerateText.bind(this)
    );
    
    server.registerTool(
      "ai-generate-image",
      {
        title: "Generate Image",
        description: "Generate images using Frontal AI models",
        inputSchema: aiGenerateImageSchema,
      },
      this.handleGenerateImage.bind(this)
    );
    
    server.registerTool(
      "ai-embed",
      {
        title: "Generate Embeddings",
        description: "Generate text embeddings",
        inputSchema: aiEmbedSchema,
      },
      this.handleEmbed.bind(this)
    );
  }
}
```

### Blob Adapter

Handles file storage operations including upload, download, and metadata management.

```typescript
export class BlobAdapter implements ServiceAdapter {
  name = "blob";
  
  registerTools(server: McpServer): void {
    server.registerTool(
      "blob-upload",
      {
        title: "Upload File",
        description: "Upload a file to blob storage",
        inputSchema: blobUploadSchema,
      },
      this.handleUpload.bind(this)
    );
    
    server.registerTool(
      "blob-list",
      {
        title: "List Files",
        description: "List files in a bucket",
        inputSchema: blobListSchema,
      },
      this.handleList.bind(this)
    );
  }
  
  registerResources(server: McpServer): void {
    server.registerResource(
      "blob",
      "blob://{bucket}/{key}",
      "Access files in blob storage",
      this.handleReadResource.bind(this)
    );
  }
}
```

### Functions Adapter

Manages serverless function execution and deployment.

```typescript
export class FunctionsAdapter implements ServiceAdapter {
  name = "functions";
  
  registerTools(server: McpServer): void {
    server.registerTool(
      "functions-invoke",
      {
        title: "Invoke Function",
        description: "Execute a serverless function",
        inputSchema: functionsInvokeSchema,
      },
      this.handleInvoke.bind(this)
    );
    
    server.registerTool(
      "functions-list",
      {
        title: "List Functions",
        description: "List deployed functions",
        inputSchema: functionsListSchema,
      },
      this.handleList.bind(this)
    );
  }
}
```

### Graph Adapter

Provides access to Frontal's graph database for complex data relationships.

```typescript
export class GraphAdapter implements ServiceAdapter {
  name = "graph";
  
  registerTools(server: McpServer): void {
    server.registerTool(
      "graph-query",
      {
        title: "Query Graph",
        description: "Execute graph database queries",
        inputSchema: graphQuerySchema,
      },
      this.handleQuery.bind(this)
    );
    
    server.registerTool(
      "graph-create-node",
      {
        title: "Create Node",
        description: "Create a graph node",
        inputSchema: graphCreateNodeSchema,
      },
      this.handleCreateNode.bind(this)
    );
  }
}
```

### Pipelines Adapter

Orchestrates complex workflows and pipeline execution.

```typescript
export class PipelinesAdapter implements ServiceAdapter {
  name = "pipelines";
  
  registerTools(server: McpServer): void {
    server.registerTool(
      "pipelines-create",
      {
        title: "Create Pipeline",
        description: "Create a new pipeline",
        inputSchema: pipelinesCreateSchema,
      },
      this.handleCreate.bind(this)
    );
    
    server.registerTool(
      "pipelines-run",
      {
        title: "Run Pipeline",
        description: "Execute a pipeline",
        inputSchema: pipelinesRunSchema,
      },
      this.handleRun.bind(this)
    );
  }
}
```

## Configuration Management

### Server Configuration

```typescript
export interface ServerConfig {
  apiKey: string;
  baseUrl: string;
  transport: TransportConfig;
  auth: AuthConfig;
  services: ServiceConfig;
  logLevel: "error" | "warn" | "info" | "debug";
  verbose: boolean;
}

export interface TransportConfig {
  transport: "stdio" | "http";
  http?: {
    port: number;
    host: string;
  };
}

export interface ServiceConfig {
  ai: boolean;
  blob: boolean;
  functions: boolean;
  graph: boolean;
  pipelines: boolean;
}
```

### Environment Variables

```bash
# Core configuration
FRONTAL_API_KEY=your_api_key
FRONTAL_BASE_URL=https://api.frontal.dev/v1

# Transport configuration
MCP_TRANSPORT=stdio
MCP_HTTP_PORT=3000
MCP_HTTP_HOST=localhost

# Service toggles
ENABLE_AI=true
ENABLE_BLOB=true
ENABLE_FUNCTIONS=true
ENABLE_GRAPH=true
ENABLE_PIPELINES=true

# Logging
MCP_LOG_LEVEL=info
MCP_VERBOSE=false
```

### Configuration Loading

```typescript
// src/config/create-config.ts
export function createConfig(options: ConfigOptions): ServerConfig {
  // Load from environment variables
  const envConfig = loadFromEnv();
  
  // Load from config file if specified
  const fileConfig = options.configPath 
    ? loadFromFile(options.configPath)
    : {};
  
  // Apply CLI overrides
  const cliConfig = applyCliOverrides(options);
  
  // Merge and validate
  const mergedConfig = mergeConfigs(envConfig, fileConfig, cliConfig);
  return serverConfigSchema.parse(mergedConfig);
}
```

## Error Handling

### Error Types

```typescript
export class McpServerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'McpServerError';
  }
}

export class ValidationError extends McpServerError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

export class ServiceError extends McpServerError {
  constructor(service: string, message: string, details?: any) {
    super(`${service} service error: ${message}`, 'SERVICE_ERROR', details);
  }
}
```

### Error Response Format

```typescript
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
  id: string | number;
  jsonrpc: "2.0";
}
```

### Error Handling Strategy

```typescript
// Centralized error handling
export function handleError(error: unknown, requestId?: string): ErrorResponse {
  // Log full error for debugging
  logger.error('MCP Server error', { error, requestId });
  
  // Convert to MCP error
  const mcpError = error instanceof McpServerError 
    ? error 
    : new McpServerError('Internal server error', 'INTERNAL_ERROR');
  
  return {
    error: {
      code: mcpError.code,
      message: mcpError.message,
      details: mcpError.details
    },
    id: requestId ?? null,
    jsonrpc: "2.0"
  };
}
```

## Logging and Monitoring

### Structured Logging

```typescript
// src/utils/logger.ts
export function createLogger(config: LoggerConfig): Logger {
  return winston.createLogger({
    level: config.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: {
      service: 'frontal-mcp-server',
      version: process.env.npm_package_version
    },
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'mcp-server.log' })
    ]
  });
}
```

### Metrics Collection

```typescript
// src/utils/metrics.ts
export const metrics = {
  // Request metrics
  requestCount: new Counter({
    name: 'mcp_requests_total',
    help: 'Total number of MCP requests',
    labelNames: ['service', 'tool', 'status']
  }),
  
  requestDuration: new Histogram({
    name: 'mcp_request_duration_seconds',
    help: 'Duration of MCP requests',
    labelNames: ['service', 'tool']
  }),
  
  // Error metrics
  errorCount: new Counter({
    name: 'mcp_errors_total',
    help: 'Total number of MCP errors',
    labelNames: ['service', 'tool', 'error_type']
  })
};
```

## Security Considerations

### Authentication

```typescript
// API key validation
export function validateApiKey(apiKey: string): boolean {
  if (!apiKey || apiKey.length < 32) {
    throw new ValidationError('Invalid API key format');
  }
  return true;
}

// Request authentication
export function authenticateRequest(request: MCPRequest): void {
  const apiKey = request.headers?.['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    throw new AuthenticationError('Missing API key');
  }
  
  validateApiKey(apiKey);
}
```

### Input Validation

```typescript
// Zod schema validation
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    throw new ValidationError('Invalid input', error.issues);
  }
}
```

### Rate Limiting

```typescript
// Token bucket rate limiter
export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  
  isAllowed(clientId: string, limit: number, window: number): boolean {
    const bucket = this.getBucket(clientId);
    return bucket.consume(1, window);
  }
  
  private getBucket(clientId: string): TokenBucket {
    if (!this.buckets.has(clientId)) {
      this.buckets.set(clientId, new TokenBucket());
    }
    return this.buckets.get(clientId)!;
  }
}
```

## Performance Optimization

### Connection Pooling

```typescript
// HTTP connection pool
export class ConnectionPool {
  private connections: Array<Connection> = [];
  private maxConnections: number;
  
  async acquire(): Promise<Connection> {
    if (this.connections.length > 0) {
      return this.connections.pop()!;
    }
    
    if (this.activeConnections < this.maxConnections) {
      return this.createConnection();
    }
    
    throw new Error('Connection pool exhausted');
  }
  
  release(connection: Connection): void {
    if (connection.isHealthy()) {
      this.connections.push(connection);
    } else {
      connection.close();
    }
  }
}
```

### Caching Strategy

```typescript
// Multi-level caching
export class CacheManager {
  private memoryCache = new Map<string, CacheEntry>();
  private redisCache?: Redis;
  
  async get<T>(key: string): Promise<T | null> {
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && !memoryEntry.isExpired()) {
      return memoryEntry.value;
    }
    
    // Check Redis cache
    if (this.redisCache) {
      const redisValue = await this.redisCache.get(key);
      if (redisValue) {
        const parsed = JSON.parse(redisValue);
        this.memoryCache.set(key, { value: parsed, expiresAt: Date.now() + 60000 });
        return parsed;
      }
    }
    
    return null;
  }
}
```

## Testing Strategy

### Unit Testing

```typescript
// tests/unit/ai-adapter.test.ts
describe('AIAdapter', () => {
  let adapter: AIAdapter;
  let mockApiClient: MockAPIClient;
  
  beforeEach(() => {
    mockApiClient = new MockAPIClient();
    adapter = new AIAdapter(mockConfig, mockLogger);
  });
  
  it('should register tools correctly', () => {
    const mockServer = createMockMcpServer();
    adapter.registerTools(mockServer);
    
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'ai-generate-text',
      expect.any(Object),
      expect.any(Function)
    );
  });
});
```

### Integration Testing

```typescript
// tests/integration/mcp-server.test.ts
describe('FrontalMcpServer Integration', () => {
  let server: FrontalMcpServer;
  
  beforeAll(async () => {
    server = new FrontalMcpServer(testConfig, testLogger);
    await server.initialize();
  });
  
  it('should handle tool calls end-to-end', async () => {
    const result = await server.callTool('ai-generate-text', {
      model: 'frontal-gpt-4',
      prompt: 'Test prompt'
    });
    
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('text');
  });
});
```

## Deployment

### Docker Configuration

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN bun install --production

COPY . .
RUN bun run build

FROM node:18-alpine AS runtime

RUN addgroup -g 1001 -S nodejs
RUN adduser -S mcpserver -u 1001

WORKDIR /app
COPY --from=builder --chown=mcpserver:nodejs /app/dist ./dist
COPY --from=builder --chown=mcpserver:nodejs /app/node_modules ./node_modules

USER mcpserver

EXPOSE 3000

CMD ["node", "dist/bin/frontal-mcp-server.js"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontal-mcp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: frontal-mcp-server
  template:
    metadata:
      labels:
        app: frontal-mcp-server
    spec:
      containers:
      - name: mcp-server
        image: frontal/mcp-server:latest
        ports:
        - containerPort: 3000
        env:
        - name: FRONTAL_API_KEY
          valueFrom:
            secretKeyRef:
              name: frontal-secrets
              key: api-key
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## Troubleshooting

### Common Issues

1. **Connection Failures**
   - Check API key validity
   - Verify network connectivity
   - Review transport configuration

2. **Tool Registration Errors**
   - Validate schema definitions
   - Check adapter initialization
   - Review service configuration

3. **Performance Issues**
   - Monitor request duration
   - Check connection pool status
   - Review caching effectiveness

### Debug Mode

```bash
# Enable debug logging
MCP_LOG_LEVEL=debug frontal-mcp-server --transport stdio

# Enable verbose mode
frontal-mcp-server --verbose --transport http --port 3000

# Validate configuration
frontal-mcp-server --validate-config --config ./config.json
```

## Future Enhancements

### Planned Features

- WebSocket transport support
- Streaming tool responses
- Advanced caching strategies
- Service mesh integration
- Enhanced monitoring dashboards

### Extension Points

- Custom transport implementations
- Plugin system for adapters
- Custom middleware support
- Advanced authentication methods

This documentation provides a comprehensive overview of the Frontal MCP Server implementation. For specific API details, see the [API Documentation](./API.md). For usage examples, see the [Usage Guide](./USAGE.md).