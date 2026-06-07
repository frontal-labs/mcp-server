# Frontal MCP Server

Model Context Protocol (MCP) server for Frontal services, providing standardized access to AI, Blob, Functions, Graph, and Pipelines through a unified interface.

## Overview

The Frontal MCP Server bridges AI assistants with Frontal's cloud services, enabling seamless integration of:
- AI text generation, embedding, and image generation
- Blob storage operations
- Serverless function execution
- Graph database queries
- Pipeline orchestration

## Features

- **Multi-Service Support**: Unified access to all Frontal services
- **Flexible Transport**: Support for both stdio and HTTP transports
- **Type Safety**: Full TypeScript support with Zod validation
- **Extensible Architecture**: Plugin-based adapter system
- **Comprehensive Logging**: Winston-based logging with configurable levels
- **Error Handling**: Robust error handling with retry mechanisms

## Quick Start

### Installation

```bash
npm install @frontal-labs/mcp-server
# or
bun add @frontal-labs/mcp-server
```

### Basic Usage

```bash
# Using environment variables
export FRONTAL_API_KEY=your_api_key
export FRONTAL_BASE_URL=https://api.frontal.cloud
frontal-mcp-server

# Using configuration file
frontal-mcp-server --config ./config.json
```

### Configuration

Create a configuration file:

```json
{
  "apiKey": "your_api_key",
  "baseUrl": "https://api.frontal.cloud",
  "transport": {
    "transport": "stdio"
  },
  "services": {
    "ai": true,
    "blob": true,
    "functions": true,
    "graph": true,
    "pipelines": true
  },
  "logLevel": "info"
}
```

## Architecture

The server is built with a modular architecture:

- **Server Core**: Main MCP server implementation
- **Service Adapters**: Individual adapters for each Frontal service
- **Configuration Management**: Flexible configuration with validation
- **Transport Layer**: Support for stdio and HTTP transports
- **API Client**: Unified client for Frontal API interactions

## Services

### AI Services
- Text generation with various models
- Text embedding for semantic search
- Image generation capabilities

### Blob Storage
- Upload and download files
- Manage containers and metadata
- Support for various file types

### Functions
- Execute serverless functions
- Manage function deployments
- Monitor execution status

### Graph Database
- Query graph data
- Manage nodes and relationships
- Support for complex traversals

### Pipelines
- Orchestrate complex workflows
- Monitor pipeline execution
- Manage pipeline definitions

## Development

### Building

```bash
bun run build
```

### Testing

```bash
bun run test
bun run test:coverage
```

### Linting

```bash
bun run lint
bun run format
```

## Documentation

- [API Documentation](./API.md) - Detailed API reference
- [Usage Guide](./USAGE.md) - Comprehensive usage examples
- [Developer Guide](./DEVELOPERS.md) - Development and contribution guide
- [MCP Server Details](./MCP_SERVER.md) - MCP-specific implementation details

## License

MIT License - see LICENSE.md for details.

## Support

- GitHub Issues: [Report bugs and request features](https://github.com/frontal-labs/mcp-server/issues)
- Documentation: [Full documentation](https://docs.frontal.cloud)
- Community: [Join our Discord](https://discord.gg/frontal)