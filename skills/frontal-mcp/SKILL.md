---
name: frontal-mcp
description: Install, configure, and use the Frontal MCP Server. Use when connecting Claude Desktop or any MCP client to api.frontal.dev, selecting toolsets, or calling ontology, data-platform, or generic endpoint tools.
---

# Frontal MCP Server

Standalone MCP server for the Frontal public API (`api.frontal.dev`). Hybrid of curated typed tools plus spec-driven generic meta-tools covering ~450 operations from the vendored OpenAPI spec (`openapi/public.v1.json`).

## Setup

1. Get an API key from [Frontal Platform](https://platform.frontal.dev) (`frt_...`).
2. Set env: `export FRONTAL_API_KEY="your_api_key_here"`.
3. Start:
   ```bash
   # stdio (Claude Desktop / local)
   frontal-mcp-server --transport stdio

   # HTTP (web apps / multi-tenant hosting)
   frontal-mcp-server --transport http --port 3000
   ```

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "frontal": {
      "command": "frontal-mcp-server",
      "args": ["--transport", "stdio"],
      "env": { "FRONTAL_API_KEY": "your_api_key_here" }
    }
  }
}
```

## Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `FRONTAL_API_KEY` | - | Required for stdio only; never a fallback for HTTP |
| `FRONTAL_BASE_URL` | `https://api.frontal.dev` | Bare host; `/v1/` is in the paths |
| `FRONTAL_REGION` | - | Region pin (`x-frontal-region`, e.g. `iad`, `lhr`, `fra`, `sin`) |
| `FRONTAL_TOOLSETS` | `generic,ontology,data` | Comma-separated; invalid values are rejected |
| `FRONTAL_HTTP_ALLOWED_ORIGINS` | - (none trusted) | CORS allowlist for HTTP transport; never `*` |
| `MCP_LOG_LEVEL` | `info` | `error|warn|info|debug` |

HTTP transport rules:

- Every MCP request must send per-request `Authorization: Bearer frt_...`; missing token is `401`.
- Exception: unauthenticated `GET /health` always returns `200 {"status":"ok"}`.
- CLI: `-t/--transport stdio|http`, `-p/--port`, `-h/--host`, `-k/--api-key`, `-c/--config`, `-v/--verbose`, `--log-level`.

## Tools

Select via `FRONTAL_TOOLSETS=generic,ontology,data`.

### Generic (spec-driven) — `generic`

- `frontal_list_endpoints` — browse API surface by tag/search.
- `frontal_describe_endpoint` — full parameter/body/response detail for one operation.
- `frontal_call_endpoint` — invoke any operation by `operationId` (or `method` + `path`), with optional auto-pagination.

Workflow: list → describe → call. Use for anything without a curated tool.

### Ontology / knowledge graph (curated) — `ontology`

`ontology_list_objects`, `ontology_get_object`, `ontology_list_object_types`,
`ontology_list_relationships`, `ontology_query_graph`,
`ontology_graph_neighborhood`, `ontology_graph_path`,
`ontology_extract_entities`, `ontology_list_schemas`, `ontology_get_schema`.

### Data platform (curated) — `data`

`data_query_federated`, `data_list_datasets`, `data_get_dataset`,
`data_list_pipelines`, `data_create_pipeline`, `data_get_pipeline`,
`data_list_pipeline_runs`, `data_get_pipeline_run`, `data_ingest_dataset`,
`data_list_streams`, `data_list_schemas`.

## Guidance for agents

- Prefer curated `ontology_*` / `data_*` tools when they fit; fall back to `frontal_*` generic tools otherwise.
- The client handles Bearer `frt_` auth, cursor pagination, `429`/`Retry-After` backoff, retry on 429/502/503/504 (never 401/409/501), idempotency keys on retried writes, and region pinning — don't reimplement.
- Keep `FRONTAL_API_KEY` in env, never in code, logs, or version control.
- Reference: [README.md](../../README.md), [ARCHITECTURE.md](../../ARCHITECTURE.md), [docs/](../../docs/).
