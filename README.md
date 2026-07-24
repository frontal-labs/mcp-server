<picture>
 <source srcset="./banner-dark.png" media="(prefers-color-scheme: dark)">
 <source srcset="./banner.png" media="(prefers-color-scheme: light)">
 <img src="./banner-dark.png" alt="Frontal Banner">
</picture>

# Frontal MCP Server

A standalone Model Context Protocol (MCP) server for the Frontal public API
(`api.frontal.dev`). It exposes the API as a **hybrid** of curated, typed tools
for the highest-value surfaces (ontology / knowledge graph and the data
platform) plus spec-driven generic meta-tools that can reach any of the API's
~430 operations — all driven by the vendored OpenAPI spec.

## Quick Start

### Installation

```bash
# Install globally
npm install -g @frontal-labs/mcp-server

# Or install locally
npm install @frontal-labs/mcp-server
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

- **Full API coverage**: Generic meta-tools drive any endpoint from the
  vendored OpenAPI spec (`api.frontal.dev`, ~430 operations).
- **Curated tools**: First-class, typed tools for the ontology /
  knowledge-graph and data-platform surfaces.
- **Edge-aware client**: Bearer `frt_` auth, cursor pagination,
  `429`/`Retry-After` backoff, the edge retry matrix (retry 429/502/503/504,
  never 401/409/501), idempotency keys on retried writes, and region pinning.
- **Multi-transport**: stdio (local / Claude Desktop) and Streamable HTTP,
  with per-request `Authorization` for multi-tenant hosting.
- **Type safe**: TypeScript throughout with Zod-validated tool inputs.
- **Monitoring**: Optional incident.io status-page integration and structured logging.

## Available Tools

Tools are grouped into **tool sets** selectable via `FRONTAL_TOOLSETS`.

### Generic (spec-driven) — `generic`

- **frontal_list_endpoints**: Browse the API surface, filtered by tag/search.
- **frontal_describe_endpoint**: Full parameter/body/response detail for one operation.
- **frontal_call_endpoint**: Invoke any operation by `operationId` (or `method` + `path`), with optional auto-pagination.

### Ontology (curated) — `ontology`

`ontology_list_objects`, `ontology_get_object`, `ontology_list_object_types`,
`ontology_list_relationships`, `ontology_query_graph`,
`ontology_graph_neighborhood`, `ontology_graph_path`,
`ontology_extract_entities`, `ontology_list_schemas`, `ontology_get_schema`.

### Data platform (curated) — `data`

`data_query_federated`, `data_list_datasets`, `data_get_dataset`,
`data_list_pipelines`, `data_create_pipeline`, `data_get_pipeline`,
`data_list_pipeline_runs`, `data_get_pipeline_run`, `data_ingest_dataset`,
`data_list_streams`, `data_list_schemas`.

Everything not covered by a curated tool stays reachable via the generic tools.

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `FRONTAL_API_KEY` | Frontal API key (`frt_...`). Fallback for HTTP; required for stdio | - | For stdio |
| `FRONTAL_BASE_URL` | API base URL (bare host; `/v1/` is in the paths) | `https://api.frontal.dev` | No |
| `FRONTAL_REGION` | Region pin (`x-frontal-region`, e.g. `iad`, `lhr`, `fra`, `sin`) | - | No |
| `FRONTAL_TOOLSETS` | Comma-separated tool sets to register | `generic,ontology,data` | No |
| `MCP_LOG_LEVEL` | Log level | `info` | No |

Over the HTTP transport, callers may send a per-request
`Authorization: Bearer frt_...` header, which overrides `FRONTAL_API_KEY`
(enables multi-tenant hosting).

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

# Register only specific tool sets
FRONTAL_TOOLSETS=generic,data FRONTAL_API_KEY=your_key ./dist/bin/frontal-mcp-server.js
```

### Programmatic Usage

```typescript
import { FrontalMcpServer, createLogger } from '@frontal-labs/mcp-server';

import { createConfig } from '@frontal-labs/mcp-server';

const config = createConfig({
  apiKey: 'frt_your_api_key',
  toolsets: ['generic', 'ontology', 'data'],
  transport: { transport: 'stdio' },
});

const logger = createLogger({ level: 'info' });
const server = new FrontalMcpServer(config, logger);

await server.initialize();
await server.connectStdio();
```

## Architecture

The server is a thin, spec-driven layer over the Frontal public API:

1. **Vendored OpenAPI spec** (`openapi/public.v1.json`) indexed at startup —
   the source of truth for endpoints, params, and auth.
2. **Frontal client** (`src/clients/frontal-client.ts`) — an edge-aware fetch
   client (auth, pagination, retry matrix, idempotency, region pin, errors).
3. **Tool adapters** — a generic (meta-tool) adapter plus curated
   ontology/data adapters, gated by `FRONTAL_TOOLSETS`.
4. **Transport layer** — stdio and Streamable HTTP, the latter binding a
   per-request bearer token via AsyncLocalStorage.

See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

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

**Completed:**

- Spec-driven integration against the real `api.frontal.dev` OpenAPI contract
  (vendored + refreshable via `bun run sync-spec`).
- Generic meta-tools (full coverage) + curated ontology/data tools.
- Edge-aware client (auth, pagination, retry matrix, idempotency, region pin).
- stdio and Streamable HTTP transports, per-request auth over HTTP.
- Test suite and CI (lint, type-check, coverage, build) plus Fly.io deploy.

**Planned:**

- Curated tools for more surfaces (events, webhooks, integrations, workflows,
  billing) — reachable today via the generic tools.
- MCP resources/prompts and optional OAuth flows.

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
