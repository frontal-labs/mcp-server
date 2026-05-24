<picture>
 <source srcset="./banner-dark.png" media="(prefers-color-scheme: dark)">
 <source srcset="./banner.png" media="(prefers-color-scheme: light)">
 <img src="./banner-dark.png" alt="Frontal Banner">
</picture>

# Frontal MCP Server

A standalone Model Context Protocol (MCP) server that provides seamless access to Frontal's cloud services (AI, Blob Storage, Functions, Graph Database, and Pipelines) through a standardized interface.

## Quick Start

### Installation

```bash
# Install globally
npm install -g @frontal/mcp-server

# Or install locally
npm install @frontal/mcp-server
```

### Basic Setup

1. **Get your API key** from [Frontal Dashboard](https://dashboard.frontal.dev)

2. **Set up environment**:

```bash
export FRONTAL_API_KEY="your_api_key_here"
```

3. **Start the server**:

```bash
# For Claude Desktop (stdio transport)
frontal-mcp-server --transport stdio

# For web applications (HTTP transport)
frontal-mcp-server --transport http --port 3000
```

### Claude Desktop Integration

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

## Features

- **AI Services**: Text generation, image creation, and embeddings
- **Blob Storage**: File upload, download, and management
- **Functions**: Serverless function execution and management
- **Graph Database**: Graph queries and node creation
- **Pipelines**: Data pipeline creation and execution
- **Multi-Transport**: Support for both stdio and HTTP
- **Type Safe**: Full TypeScript support with Zod validation
- **Monitoring**: Built-in metrics and logging

## Available Tools

The Frontal MCP Server provides access to the following services:

### AI Service

- **ai-generate-text**: Generate text using AI models
- **ai-generate-image**: Generate images from text prompts
- **ai-embed**: Generate text embeddings

### Blob Storage

- **blob-upload**: Upload files to blob storage
- **blob-list**: List objects in storage buckets

### Functions

- **functions-invoke**: Execute serverless functions
- **functions-list**: List deployed functions

### Graph Database

- **graph-query**: Execute graph queries
- **graph-create-node**: Create graph nodes

### Pipelines

- **pipelines-create**: Create data pipelines
- **pipelines-run**: Execute pipelines

See [API Documentation](docs/API.md) for detailed tool specifications.

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `FRONTAL_API_KEY` | Frontal API key | - | Yes |
| `FRONTAL_BASE_URL` | API base URL | `https://api.frontal.dev/v1` | No |
| `MCP_LOG_LEVEL` | Log level | `info` | No |
| `ENABLE_AI` | Enable AI service | `true` | No |
| `ENABLE_BLOB` | Enable Blob service | `true` | No |
| `ENABLE_FUNCTIONS` | Enable Functions service | `true` | No |
| `ENABLE_GRAPH` | Enable Graph service | `true` | No |
| `ENABLE_PIPELINES` | Enable Pipelines service | `true` | No |

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

## Usage Examples

### Basic Usage

```bash
# Start with stdio transport (for Claude Desktop)
FRONTAL_API_KEY=your_key ./dist/bin/frontal-mcp-server.js

# Start with HTTP transport for web integration
FRONTAL_API_KEY=your_key ./dist/bin/frontal-mcp-server.js --transport http --port 3000

# Enable only specific services
ENABLE_AI=true ENABLE_BLOB=false ./dist/bin/frontal-mcp-server.js
```

### Programmatic Usage

```typescript
import { FrontalMcpServer, createLogger } from '@frontal/mcp-server';

const config = {
  apiKey: 'your_api_key',
  transport: { transport: 'stdio' },
  services: {
    ai: true,
    blob: true,
    functions: false,
    graph: false,
    pipelines: false,
  }
};

const logger = createLogger({ level: 'info' });
const server = new FrontalMcpServer(config, logger);

await server.initialize();
await server.connectStdio();
```

## Architecture

The MCP Server follows a modular adapter pattern:

1. **Core Server**: Handles MCP protocol and transport management
2. **Service Adapters**: Each Frontal service has its own adapter
3. **Configuration**: Centralized config with environment variable support
4. **Transport Layer**: Supports both stdio and HTTP transports

## Development

### Project Structure

```text
mcp-server/
├── src/
│   ├── adapters/          # Service adapters for each Frontal service
│   ├── config/            # Configuration management
│   ├── server/            # Core MCP server implementation
│   ├── utils/             # Utilities (logging, etc.)
│   └── bin/               # CLI entry point
├── tests/                 # Test files
├── docs/                  # Documentation
└── examples/              # Integration examples
```

### Scripts

```bash
# Build the project
bun run build

# Run tests
bun run test

# Run tests in watch mode
bun run test:watch

# Generate coverage report
bun run test:coverage

# Lint code
bun run lint

# Format code
bun run format

# Type check
bun run type-check
```

## Current Status

**Completed Features:**
- Project structure and build system
- Core MCP server implementation
- Service adapters for all Frontal services
- Configuration management
- CLI interface with stdio transport
- Comprehensive test suite
- Complete API documentation

**In Development:**
- HTTP transport implementation
- Integration with real Frontal SDKs
- Advanced error handling
- Performance monitoring

## Contributing

We welcome contributions! Please see our [Developer Guide](docs/DEVELOPERS.md) for detailed information.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `bun run test`
5. Submit a pull request

## Documentation

- [API Documentation](docs/API.md) - Complete API reference
- [Usage Guide](docs/USAGE.md) - Practical examples and integration patterns
- [Developer Guide](docs/DEVELOPERS.md) - Architecture and contribution guidelines

## Troubleshooting

### Common Issues

**Server won't start:**
```bash
# Check API key
echo $FRONTAL_API_KEY

# Validate configuration
frontal-mcp-server --validate-config
```

**Connection issues:**
```bash
# Test with different transport
frontal-mcp-server --transport http --port 3000

# Check logs
frontal-mcp-server --verbose
```

**Performance issues:**
```bash
# Enable debug logging
MCP_LOG_LEVEL=debug frontal-mcp-server

# Monitor resources
top -p $(pgrep frontal-mcp-server)
```

### Getting Help

- **GitHub Issues**: Report bugs and request features
- **Discord Community**: Join our developer community
- **Documentation**: Check [docs/](docs/) for detailed guides

## License

MIT License - see [LICENSE](LICENSE) file for details.
