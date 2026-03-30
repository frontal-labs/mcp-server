# Frontal MCP Server Architecture

## Overview

The Frontal MCP Server is a standalone Model Context Protocol (MCP) server that provides seamless access to Frontal's cloud services through a standardized interface. The architecture follows a modular, adapter-based design that enables easy extension and maintenance.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontal MCP Server                        │
├─────────────────────────────────────────────────────────────┤
│                    Core Server Layer                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   MCP Server    │  │ Config Manager  │  │   Logger     │ │
│  │   (Protocol)    │  │   (Settings)    │  │ (Winston)    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                   Service Adapter Layer                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │
│  │ AI Adapter  │ │Blob Adapter │ │Func Adapter │ │  ...   │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    API Client Layer                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ HTTP Transport   │  │  Retry Logic    │  │ Error Handling│ │
│  │   (Fetch)        │  │  (Exponential)  │  │ (Custom Types)│ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                   Transport Layer                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  Stdio Transport │  │ HTTP Transport  │  │  WebSocket    │ │
│  │   (Claude)       │  │   (Web Apps)    │  │  (Future)     │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. MCP Server (`src/server/mcp-server.ts`)

The main server class that orchestrates all components:

- **FrontalMcpServer**: Core server implementation
- **Initialization**: Sets up adapters and registers MCP components
- **Lifecycle Management**: Handles startup, shutdown, and error recovery
- **Adapter Registry**: Manages active service adapters

**Key Responsibilities:**
- Initialize and configure service adapters
- Register MCP tools, resources, and prompts
- Manage transport connections
- Coordinate error handling and logging

### 2. Service Adapters (`src/adapters/`)

Modular adapters that translate Frontal API calls to MCP tools:

#### AI Adapter
- **Tools**: `ai-generate-text`, `ai-generate-image`, `ai-embed`
- **Features**: Text generation, image creation, embeddings
- **Validation**: Zod schemas for input validation

#### Blob Adapter  
- **Tools**: `blob-upload`, `blob-list`, `blob-delete`
- **Features**: File storage, object management
- **Validation**: File type and size validation

#### Functions Adapter
- **Tools**: `functions-invoke`, `functions-list`
- **Features**: Serverless function execution
- **Validation**: Parameter and payload validation

#### Graph Adapter
- **Tools**: `graph-query`, `graph-create-node`
- **Features**: Graph database operations
- **Validation**: Query syntax and node structure

#### Pipelines Adapter
- **Tools**: `pipelines-create`, `pipelines-run`
- **Features**: Data pipeline management
- **Validation**: Pipeline configuration validation

**Adapter Interface:**
```typescript
interface ServiceAdapter {
  name: string;
  initialize(config: ServerConfig, logger: Logger): Promise<void>;
  registerTools(server: McpServer): void;
  registerResources?(server: McpServer): void;
  registerPrompts?(server: McpServer): void;
}
```

### 3. Configuration Management (`src/config/`)

Centralized configuration with environment variable support:

- **ServerConfig**: Main configuration structure
- **Environment Variables**: `.env` file support
- **Validation**: Zod schema validation
- **Service Configuration**: Per-service enable/disable flags

**Configuration Structure:**
```typescript
interface ServerConfig {
  apiKey: string;
  baseUrl: string;
  transport: TransportConfig;
  auth: AuthConfig;
  services: ServiceConfig;
  logLevel: LogLevel;
  verbose: boolean;
}
```

### 4. API Client (`src/services/api-client.ts`)

Unified HTTP client with advanced features:

- **Retry Logic**: Exponential backoff with jitter
- **Error Handling**: Custom error types with context
- **Request Tracking**: Unique request IDs for debugging
- **Type Safety**: Zod schema validation for responses

**Key Features:**
- Automatic retry with configurable policies
- Structured error handling with service context
- Request/response validation
- Comprehensive logging and monitoring

### 5. Transport Layer (`src/server/`)

Multiple transport protocols for different use cases:

#### Stdio Transport
- **Use Case**: Claude Desktop integration
- **Protocol**: Standard input/output
- **Features**: Real-time communication

#### HTTP Transport  
- **Use Case**: Web applications and APIs
- **Protocol**: HTTP/HTTPS
- **Features**: RESTful interface, CORS support

#### Enhanced HTTP Transport
- **Use Case**: Advanced web integration
- **Features**: WebSocket support, streaming, authentication

### 6. Type System (`src/interfaces/`, `src/models/`)

Comprehensive TypeScript type definitions:

- **Interface Types**: API request/response structures
- **Model Schemas**: Zod validation schemas
- **Type Safety**: End-to-end type checking
- **Documentation**: Self-documenting code

## Data Flow

### Request Processing Flow

```
1. MCP Request → Transport Layer
2. Transport → MCP Server
3. MCP Server → Service Adapter
4. Adapter → API Client
5. API Client → Frontal API
6. Response → API Client → Adapter → MCP Server → Transport → Client
```

### Error Handling Flow

```
1. Error Detection → API Client
2. Error Classification → Retry Logic
3. Error Enhancement → Context Addition
4. Error Propagation → Adapter → MCP Server
5. Error Response → Transport → Client
```

## Security Architecture

### Authentication
- **API Key Authentication**: Bearer token in headers
- **Environment Variables**: Secure credential storage
- **Request Signing**: Optional request signing for high-security

### Authorization
- **Service-Level Control**: Enable/disable per service
- **Operation-Level Control**: Granular permission checks
- **Resource-Based Control**: Access control per resource

### Data Protection
- **Input Validation**: Zod schema validation
- **Output Sanitization**: Response data cleaning
- **Error Sanitization**: Sensitive information filtering

## Performance Architecture

### Caching Strategy
- **Response Caching**: Memoize frequent API calls
- **Connection Pooling**: Reuse HTTP connections
- **Resource Caching**: Cache MCP resources and prompts

### Optimization Features
- **Lazy Loading**: Initialize adapters on demand
- **Batch Operations**: Group related API calls
- **Compression**: HTTP response compression
- **Timeouts**: Configurable request timeouts

### Monitoring
- **Request Metrics**: Track API call performance
- **Error Metrics**: Monitor error rates and types
- **Resource Metrics**: Track memory and CPU usage

## Extensibility Architecture

### Adding New Services

1. **Create Adapter**: Implement `ServiceAdapter` interface
2. **Define Types**: Add TypeScript interfaces and Zod schemas
3. **Register Service**: Add to server initialization
4. **Add Tests**: Comprehensive test coverage

### Custom Transports

1. **Implement Transport**: Create transport class
2. **Add Configuration**: Update config schemas
3. **Register Transport**: Add to server options
4. **Add Documentation**: Update usage guides

### Plugin Architecture

The server supports a plugin-based architecture for:

- **Custom Adapters**: Third-party service integrations
- **Custom Transports**: Alternative communication protocols
- **Middleware**: Request/response processing pipeline
- **Extensions**: Additional tools and resources

## Deployment Architecture

### Container Deployment
- **Docker Image**: Multi-stage build optimization
- **Kubernetes**: Helm charts for orchestration
- **Health Checks**: Readiness and liveness probes
- **Resource Limits**: CPU and memory constraints

### Cloud Deployment
- **Serverless**: AWS Lambda, Vercel Functions
- **Container Services**: ECS, GKE, AKS
- **Managed Services**: Cloud Run, App Engine
- **Edge Deployment**: CDN and edge computing

### Development Deployment
- **Local Development**: Docker Compose setup
- **Testing**: Automated test environments
- **CI/CD**: GitHub Actions workflows
- **Monitoring**: Integrated observability

## Testing Architecture

### Unit Testing
- **Adapter Tests**: Isolated service adapter testing
- **Client Tests**: API client functionality
- **Config Tests**: Configuration validation
- **Utility Tests**: Helper function testing

### Integration Testing
- **End-to-End**: Complete request/response flows
- **API Integration**: Real Frontal API testing
- **Transport Testing**: Multiple protocol testing
- **Error Scenarios**: Failure mode testing

### Test Infrastructure
- **Mock Framework**: Consistent test doubles
- **Test Utilities**: Helper functions and fixtures
- **Coverage Reports**: Comprehensive coverage metrics
- **Performance Tests**: Load and stress testing

## Monitoring and Observability

### Logging Strategy
- **Structured Logging**: JSON format with context
- **Log Levels**: Debug, info, warn, error
- **Request Tracing**: Unique request IDs
- **Service Context**: Per-service log separation

### Metrics Collection
- **Request Metrics**: Counters, histograms, gauges
- **Error Metrics**: Error rates and types
- **Performance Metrics**: Latency and throughput
- **Resource Metrics**: Memory and CPU usage

### Health Monitoring
- **Health Checks**: Service availability checks
- **Dependency Health**: External service monitoring
- **Performance Monitoring**: Response time tracking
- **Alert Integration**: External alert systems

## Future Architecture Considerations

### Scalability
- **Horizontal Scaling**: Multi-instance deployment
- **Load Balancing**: Request distribution
- **Caching Layers**: Distributed caching
- **Database Sharding**: Data partitioning

### Resilience
- **Circuit Breakers**: Fault tolerance patterns
- **Bulkhead Patterns**: Isolation boundaries
- **Retry Policies**: Advanced retry strategies
- **Graceful Degradation**: Fallback mechanisms

### Evolution
- **Protocol Updates**: MCP protocol evolution
- **Service Expansion**: New Frontal services
- **Performance Optimization**: Continuous improvement
- **Security Enhancements**: Ongoing security updates

## Architecture Principles

1. **Modularity**: Clear separation of concerns
2. **Extensibility**: Plugin-based architecture
3. **Type Safety**: Comprehensive TypeScript usage
4. **Error Handling**: Robust error management
5. **Performance**: Optimized for high throughput
6. **Security**: Defense-in-depth approach
7. **Observability**: Comprehensive monitoring
8. **Testability**: High test coverage
9. **Maintainability**: Clean code practices
10. **Documentation**: Self-documenting architecture

This architecture provides a solid foundation for the Frontal MCP Server, enabling reliable, scalable, and maintainable integration with Frontal's cloud services through the Model Context Protocol.