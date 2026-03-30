# Frontal MCP Server - Developer Guide

## Overview

This guide is for developers who want to contribute to, extend, or integrate with the Frontal MCP Server. It covers architecture, development setup, testing, and best practices.

## Architecture

### Core Components

```
src/
├── adapters/           # Service adapters for Frontal APIs
├── config/            # Configuration management
├── server/            # MCP server implementation
├── utils/             # Utility functions
├── interfaces/        # TypeScript interfaces
├── services/          # Business logic services
└── bin/               # CLI entry point
```

### Design Patterns

#### Adapter Pattern
Each Frontal service (AI, Blob, Functions, etc.) has its own adapter:

```typescript
// src/adapters/ai-adapter.ts
export class AIAdapter {
  constructor(private config: AIConfig) {}
  
  async generateText(params: TextGenerationParams): Promise<TextResult> {
    // Implementation
  }
}
```

#### Server Pattern
The main MCP server coordinates all adapters:

```typescript
// src/server/mcp-server.ts
export class FrontalMcpServer {
  private adapters: Map<string, ServiceAdapter>;
  
  async initialize(): Promise<void> {
    // Initialize adapters based on config
  }
}
```

#### Configuration Pattern
Centralized configuration with environment variable support:

```typescript
// src/config/server-config.ts
export const ServerConfigSchema = z.object({
  apiKey: z.string(),
  transport: z.object({
    transport: z.enum(['stdio', 'http']),
    http: z.object({
      host: z.string(),
      port: z.number()
    }).optional()
  }),
  services: z.object({
    ai: z.boolean(),
    blob: z.boolean(),
    // ...
  })
});
```

## Development Setup

### Prerequisites

- Node.js 18+ or Bun 1.3.8+
- Git
- VS Code (recommended)

### Local Development

1. **Clone the repository**

```bash
git clone https://github.com/frontal-cloud/mcp-server.git
cd mcp-server
```

2. **Install dependencies**

```bash
bun install
```

3. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start development server**

```bash
# For stdio transport (default)
bun run dev

# For HTTP transport
FRONTAL_API_KEY=your_key bun run dev --transport http --port 3000
```

### IDE Configuration

#### VS Code Extensions

- TypeScript and JavaScript Language Features
- Biome (for linting and formatting)
- GitLens
- Thunder Client (for API testing)

#### VS Code Settings

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

## Code Style and Standards

### Formatting and Linting

We use Biome for consistent code formatting:

```bash
# Check linting
bun run lint

# Auto-fix issues
bun run lint:fix

# Format code
bun run format
```

### Code Conventions

1. **TypeScript**: Strict mode enabled
2. **Naming**: 
   - Classes: PascalCase
   - Functions/Variables: camelCase
   - Constants: UPPER_SNAKE_CASE
3. **Imports**: Grouped and sorted
4. **Comments**: JSDoc for public APIs
5. **Error Handling**: Proper error types and logging

### Example Code Structure

```typescript
/**
 * Adapter for Frontal AI service
 */
export class AIAdapter implements ServiceAdapter {
  private readonly logger: Logger;
  
  constructor(config: AIConfig, logger: Logger) {
    this.logger = logger.child({ service: 'ai' });
  }
  
  /**
   * Generate text using AI models
   */
  async generateText(params: TextGenerationParams): Promise<TextResult> {
    try {
      this.logger.debug('Generating text', { params });
      
      const result = await this.apiClient.generateText(params);
      
      this.logger.info('Text generated successfully', {
        model: result.model,
        tokens: result.usage.totalTokens
      });
      
      return result;
    } catch (error) {
      this.logger.error('Failed to generate text', { error, params });
      throw new AIServiceError('Text generation failed', error);
    }
  }
}
```

## Testing

### Test Structure

```
tests/
├── unit/              # Unit tests
├── integration/       # Integration tests
├── e2e/              # End-to-end tests
└── fixtures/         # Test data
```

### Running Tests

```bash
# Run all tests
bun run test

# Run tests in watch mode
bun run test:watch

# Generate coverage report
bun run test:coverage

# Run specific test file
bun test tests/unit/ai-adapter.test.ts
```

### Writing Tests

#### Unit Tests

```typescript
// tests/unit/ai-adapter.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIAdapter } from '../../src/adapters/ai-adapter';
import { MockAPIClient } from '../mocks/api-client';

describe('AIAdapter', () => {
  let adapter: AIAdapter;
  let mockClient: MockAPIClient;
  
  beforeEach(() => {
    mockClient = new MockAPIClient();
    adapter = new AIAdapter(mockConfig, mockLogger);
  });
  
  it('should generate text successfully', async () => {
    const params = {
      model: 'frontal-gpt-4',
      prompt: 'Test prompt',
      maxTokens: 100
    };
    
    mockClient.generateText.mockResolvedValue(mockTextResult);
    
    const result = await adapter.generateText(params);
    
    expect(result).toEqual(mockTextResult);
    expect(mockClient.generateText).toHaveBeenCalledWith(params);
  });
  
  it('should handle API errors', async () => {
    mockClient.generateText.mockRejectedValue(new APIError('Service unavailable'));
    
    await expect(adapter.generateText(params)).rejects.toThrow(AIServiceError);
  });
});
```

#### Integration Tests

```typescript
// tests/integration/mcp-server.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FrontalMcpServer } from '../../src/server/mcp-server';

describe('FrontalMcpServer Integration', () => {
  let server: FrontalMcpServer;
  
  beforeAll(async () => {
    server = new FrontalMcpServer(testConfig);
    await server.initialize();
  });
  
  afterAll(async () => {
    await server.close();
  });
  
  it('should handle AI tool calls', async () => {
    const result = await server.callTool('ai-generate-text', {
      model: 'frontal-gpt-4',
      prompt: 'Test'
    });
    
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('text');
  });
});
```

### Test Utilities

```typescript
// tests/utils/test-helpers.ts
export const createMockConfig = (overrides = {}): ServerConfig => ({
  apiKey: 'test-key',
  transport: { transport: 'stdio' },
  services: { ai: true, blob: true, functions: true, graph: true, pipelines: true },
  ...overrides
});

export const createMockLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => createMockLogger()
});
```

## Adding New Services

### 1. Create Adapter

```typescript
// src/adapters/new-service-adapter.ts
export class NewServiceAdapter implements ServiceAdapter {
  constructor(private config: NewServiceConfig) {}
  
  async performAction(params: ActionParams): Promise<ActionResult> {
    // Implementation
  }
}
```

### 2. Update Configuration

```typescript
// src/config/server-config.ts
export const ServerConfigSchema = z.object({
  // ... existing fields
  services: z.object({
    // ... existing services
    newService: z.boolean().default(true)
  })
});
```

### 3. Register with Server

```typescript
// src/server/mcp-server.ts
private async initializeAdapters(): Promise<void> {
  // ... existing adapters
  
  if (this.config.services.newService) {
    this.adapters.set('newService', new NewServiceAdapter(
      this.config.newService,
      this.logger
    ));
  }
}
```

### 4. Add Tests

```typescript
// tests/unit/new-service-adapter.test.ts
describe('NewServiceAdapter', () => {
  // Test implementation
});
```

## Performance Optimization

### Monitoring

Use built-in metrics and logging:

```typescript
// src/utils/metrics.ts
export const metrics = {
  requestDuration: new Histogram({
    name: 'mcp_request_duration_seconds',
    help: 'Duration of MCP requests'
  }),
  
  requestCount: new Counter({
    name: 'mcp_requests_total',
    help: 'Total number of MCP requests',
    labelNames: ['service', 'tool', 'status']
  })
};
```

### Caching

Implement caching for frequently accessed data:

```typescript
// src/utils/cache.ts
export class CacheManager {
  private cache = new Map<string, CacheEntry>();
  
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }
  
  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000
    });
  }
}
```

### Connection Pooling

For HTTP transport, implement connection pooling:

```typescript
// src/utils/http-client.ts
export class HTTPClient {
  private pool: ConnectionPool;
  
  constructor(config: HTTPConfig) {
    this.pool = new ConnectionPool({
      maxConnections: config.maxConnections,
      timeout: config.timeout
    });
  }
}
```

## Security Best Practices

### Input Validation

Use Zod schemas for all inputs:

```typescript
// src/schemas/tool-schemas.ts
export const AIGenerateTextSchema = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1).max(10000),
  maxTokens: z.number().min(1).max(4000).optional(),
  temperature: z.number().min(0).max(2).optional()
});
```

### Error Handling

Never expose sensitive information in errors:

```typescript
// src/utils/errors.ts
export class McpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'McpError';
  }
}

export function sanitizeError(error: unknown): McpError {
  if (error instanceof McpError) {
    return error;
  }
  
  // Log full error for debugging
  logger.error('Unhandled error', { error });
  
  // Return sanitized error to client
  return new McpError('Internal server error', 'INTERNAL_ERROR');
}
```

### Rate Limiting

Implement rate limiting per client:

```typescript
// src/utils/rate-limiter.ts
export class RateLimiter {
  private limits = new Map<string, TokenBucket>();
  
  isAllowed(clientId: string, limit: number, window: number): boolean {
    const bucket = this.getBucket(clientId);
    return bucket.consume(limit, window);
  }
}
```

## Deployment

### Build Process

```bash
# Build for production
bun run build

# Build with optimizations
NODE_ENV=production bun run build
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN bun install --production

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/bin/frontal-mcp-server.js"]
```

### Environment Configuration

```bash
# .env.production
FRONTAL_API_KEY=${FRONTAL_API_KEY}
FRONTAL_BASE_URL=https://api.frontal.dev/v1
MCP_LOG_LEVEL=info
ENABLE_AI=true
ENABLE_BLOB=true
ENABLE_FUNCTIONS=true
ENABLE_GRAPH=true
ENABLE_PIPELINES=true
```

## Contributing

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `bun run test`
5. Commit changes: `git commit -m 'feat: add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Commit Message Format

Follow Conventional Commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style
- `refactor`: Refactoring
- `test`: Tests
- `chore`: Maintenance

### Code Review Guidelines

1. **Functionality**: Does it work as intended?
2. **Testing**: Are there adequate tests?
3. **Documentation**: Is the code documented?
4. **Performance**: Any performance implications?
5. **Security**: Any security concerns?
6. **Style**: Does it follow project conventions?

## Troubleshooting

### Common Issues

#### Build Failures

```bash
# Clear build cache
rm -rf dist node_modules/.cache
bun install
bun run build
```

#### Test Failures

```bash
# Run tests with verbose output
bun test --reporter=verbose

# Run specific test file
bun test tests/unit/problematic.test.ts
```

#### Runtime Errors

```bash
# Enable debug logging
MCP_LOG_LEVEL=debug bun run dev

# Check configuration
bun run dev --validate-config
```

### Debugging Tools

#### VS Code Debugging

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug MCP Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/bin/frontal-mcp-server.ts",
      "runtimeArgs": ["--loader", "ts-node/esm"],
      "env": {
        "FRONTAL_API_KEY": "test-key"
      }
    }
  ]
}
```

#### Logging

Use structured logging:

```typescript
this.logger.info('Processing request', {
  tool: 'ai-generate-text',
  requestId: 'req-123',
  userId: 'user-456'
});
```

## Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Frontal Cloud Documentation](https://docs.frontal.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vitest Testing Guide](https://vitest.dev/guide/)
- [Biome Documentation](https://biomejs.dev/)

## Getting Help

- **GitHub Issues**: Report bugs and request features
- **Discord Community**: Join our developer community
- **Documentation**: Check the official docs
- **Examples**: See the examples directory for integration patterns