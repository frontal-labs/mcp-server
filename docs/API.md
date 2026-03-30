# Frontal MCP Server API Documentation

## Overview

The Frontal MCP Server provides Model Context Protocol (MCP) access to Frontal's cloud services
through a standardized interface. It enables AI assistants to interact with Frontal's AI,
Blob Storage, Functions, Graph Database, and Pipelines services seamlessly.

### Key Features

- **Multi-Transport Support**: Both stdio and HTTP transports
- **Service Isolation**: Each Frontal service has dedicated adapters
- **Type Safety**: Full TypeScript support with Zod validation
- **Error Handling**: Comprehensive error reporting and recovery
- **Logging**: Structured logging with configurable levels
- **Extensible**: Easy to add new services and tools

## Available Tools

### AI Service Tools

#### `ai-generate-text`

Generate text using Frontal AI models with support for various parameters and fine-tuned control.

**Description:**
This tool allows you to generate human-like text using Frontal's advanced AI models. Perfect for content creation, summarization, translation, and conversational responses.

**Input Schema:**
```json
{
  "model": "string",
  "prompt": "string", 
  "maxTokens": "number (optional)",
  "temperature": "number (optional)"
}
```

**Output:**
```json
{
  "text": "string",
  "model": "string",
  "usage": {
    "promptTokens": "number",
    "completionTokens": "number", 
    "totalTokens": "number"
  }
}
```

#### `ai-generate-image`

Generate high-quality images from text descriptions using Frontal's AI image generation models.

**Description:**
Create stunning images from natural language descriptions. Supports various sizes and quality settings for different use cases.

**Input Schema:**
```json
{
  "prompt": "string",
  "size": "256x256|512x512|1024x1024",
  "quality": "standard|hd"
}
```

**Output:**
```json
{
  "url": "string",
  "prompt": "string",
  "size": "string",
  "quality": "string",
  "created": "string"
}
```

#### `ai-embed`

Generate vector embeddings for text inputs, enabling semantic search and similarity matching.

**Description:**
Convert text into high-dimensional vectors that capture semantic meaning. Essential for building search systems, recommendations, and text analysis.

**Input Schema:**
```json
{
  "text": "string",
  "model": "string"
}
```

**Output:**
```json
{
  "embedding": "number[]",
  "model": "string",
  "usage": {
    "promptTokens": "number",
    "totalTokens": "number"
  }
}
```

### Blob Storage Tools

#### `blob-upload`
Upload files to Frontal blob storage.

**Input:**
```json
{
  "bucket": "string",
  "key": "string", 
  "content": "string (base64)",
  "contentType": "string (optional)"
}
```

**Output:**
```json
{
  "bucket": "string",
  "key": "string",
  "url": "string",
  "size": "number",
  "contentType": "string",
  "etag": "string"
}
```

#### `blob-list`
List objects in a bucket.

**Input:**
```json
{
  "bucket": "string",
  "prefix": "string (optional)",
  "maxKeys": "number (optional)"
}
```

**Output:**
```json
{
  "objects": [
    {
      "key": "string",
      "size": "number",
      "lastModified": "string",
      "etag": "string"
    }
  ],
  "truncated": "boolean"
}
```

### Functions Tools

#### `functions-invoke`
Invoke a serverless function.

**Input:**
```json
{
  "name": "string",
  "payload": "object",
  "invokeAsync": "boolean"
}
```

**Output:**
```json
{
  "functionId": "string",
  "name": "string", 
  "status": "pending|completed",
  "result": "object|null",
  "executionTime": "number|null",
  "logs": "string[]"
}
```

#### `functions-list`
List deployed functions.

**Input:**
```json
{
  "status": "active|inactive|all"
}
```

**Output:**
```json
{
  "functions": [
    {
      "id": "string",
      "name": "string",
      "status": "string",
      "runtime": "string",
      "memory": "number",
      "timeout": "number",
      "created": "string"
    }
  ]
}
```

### Graph Database Tools

#### `graph-query`
Execute graph queries.

**Input:**
```json
{
  "query": "string",
  "variables": "object (optional)"
}
```

**Output:**
```json
{
  "data": {
    "nodes": [
      {
        "id": "string",
        "type": "string", 
        "properties": "object"
      }
    ],
    "edges": [
      {
        "from": "string",
        "to": "string",
        "type": "string"
      }
    ]
  },
  "executionTime": "number"
}
```

#### `graph-create-node`
Create a graph node.

**Input:**
```json
{
  "type": "string",
  "properties": "object"
}
```

**Output:**
```json
{
  "nodeId": "string",
  "type": "string",
  "properties": "object",
  "created": "string"
}
```

### Pipelines Tools

#### `pipelines-create`
Create a new pipeline.

**Input:**
```json
{
  "name": "string",
  "description": "string",
  "steps": "object[]"
}
```

**Output:**
```json
{
  "pipelineId": "string",
  "name": "string",
  "description": "string", 
  "steps": "object[]",
  "status": "string",
  "created": "string"
}
```

#### `pipelines-run`
Execute a pipeline.

**Input:**
```json
{
  "pipelineId": "string",
  "input": "object (optional)"
}
```

**Output:**
```json
{
  "runId": "string",
  "pipelineId": "string",
  "status": "string",
  "started": "string",
  "input": "object"
}
```

## Configuration

### Environment Variables

- `FRONTAL_API_KEY`: Your Frontal API key (required)
- `FRONTAL_BASE_URL`: API base URL (optional, defaults to https://api.frontal.dev/v1)
- `MCP_LOG_LEVEL`: Log level (error|warn|info|debug, optional)
- `ENABLE_AI`: Enable AI service (optional, defaults to true)
- `ENABLE_BLOB`: Enable Blob service (optional, defaults to true)
- `ENABLE_FUNCTIONS`: Enable Functions service (optional, defaults to true)
- `ENABLE_GRAPH`: Enable Graph service (optional, defaults to true)
- `ENABLE_PIPELINES`: Enable Pipelines service (optional, defaults to true)

### CLI Options

```bash
frontal-mcp-server [options]

Options:
  -t, --transport <type>     Transport type (stdio|http) [default: "stdio"]
  -p, --port <number>        HTTP port (for http transport) [default: 3000]
  -h, --host <address>       HTTP host (for http transport) [default: "localhost"]
  -k, --api-key <key>        Frontal API key
  -c, --config <path>         Configuration file path
  -v, --verbose              Verbose logging
  --log-level <level>        Log level (error|warn|info|debug) [default: "info"]
```

## Integration Examples

### Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "frontal": {
      "command": "frontal-mcp-server",
      "args": ["--transport", "stdio"],
      "env": {
        "FRONTAL_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Programmatic Usage

```typescript
import { FrontalMcpServer, createLogger } from '@frontal/mcp-server';

const config = {
  apiKey: 'your_api_key',
  transport: { transport: 'stdio' },
  // ... other config
};

const logger = createLogger({ level: 'info' });
const server = new FrontalMcpServer(config, logger);

await server.initialize();
await server.connectStdio();
```

## Error Handling

All tools return structured responses with error information. Common error types:

- Authentication errors (invalid API key)
- Validation errors (invalid input)
- Service errors (service unavailable)
- Network errors (connection issues)

## Development

### Building

```bash
bun run build
```

### Testing

```bash
bun run test
```

### Linting

```bash
bun run lint
bun run format
```
