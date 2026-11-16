# Frontal MCP Server Architecture

## Overview

The Frontal MCP Server is a standalone Model Context Protocol (MCP) server for
the Frontal public API (`api.frontal.dev`). It is **spec-driven**: a vendored
OpenAPI document is the source of truth. It is indexed at startup and powers
both the generic (any-endpoint) meta-tools and a set of curated, typed tools
for the highest-value surfaces.

The server exposes **tools only**. It has no MCP resources or prompts, and it
uses no roots, sampling or protocol-level logging.

## High-level architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontal MCP Server                       │
├──────────────────────────────────────────────────────────────┤
│  Transports                                                  │
│   ┌─────────────────────┐   ┌─────────────────────────────┐  │
│   │ stdio               │   │ Streamable HTTP             │  │
│   │ env FRONTAL_API_KEY │   │ per-request Authorization   │  │
│   └─────────────────────┘   └─────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  Tool adapters (gated by FRONTAL_TOOLSETS)                   │
│   ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│   │ generic      │  │ ontology      │  │ data             │  │
│   │ list /       │  │ (curated)     │  │ (curated)        │  │
│   │ describe /   │  │               │  │                  │  │
│   │ call         │  │               │  │                  │  │
│   └──────────────┘  └───────────────┘  └──────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  Spec index (openapi/public.v1.json)                         │
│   operation catalog · $ref resolution · lookup by id / tag   │
├──────────────────────────────────────────────────────────────┤
│  Frontal client (fetch)                                      │
│   bearer frt_ auth · cursor pagination · retries on          │
│   429/502/503/504 · Retry-After · idempotency key · region   │
│   pin · error-envelope parsing                               │
└──────────────────────────────────────────────────────────────┘
                              │  HTTPS
                              ▼
                       api.frontal.dev
```

## Source tree

| Path | What lives there |
| --- | --- |
| `bin/index.ts` | Process entry point. Calls `main()` from `src/server.ts`. |
| `src/server.ts` | The CLI (commander): parses flags, loads config, starts the chosen transport, installs `SIGTERM` / `SIGINT` handlers. |
| `src/index.ts` | Public exports of the npm package. |
| `src/mcp/index.ts` | `FrontalMcpServer`: builds `McpServer` instances and registers the enabled adapters. |
| `src/middlewares/` | The HTTP transport (`http-transport.ts`), the per-request token store (`auth.ts`) and the rate limiter (`rate-limit.ts`). |
| `src/tools/` | Tool adapters (`generic`, `ontology`, `data`, `workflows`, `integrations`, `events`), curated-tool registration (`curated.ts`), the safety policy (`policy.ts`), output-schema derivation (`output-schema.ts`) and shared helpers (`tool-helpers.ts`). |
| `src/spec/` | `SpecIndex` over the vendored OpenAPI document. |
| `src/client.ts` | `FrontalClient`, the HTTP client for the Frontal API. |
| `src/config/` | Environment schema (`env.ts`) and config loading. |
| `src/services/` | `HealthMonitor` and the incident.io client it uses. |
| `src/types/` | Shared types, the zod config schema (`config.ts`) and the error classes (`errors.ts`). |
| `src/helpers/`, `src/utils/` | Small array / async / object / string helpers and the winston logger. |
| `openapi/public.v1.json` | The vendored OpenAPI spec. |
| `scripts/` | `sync-spec.ts` (refresh or check the vendored spec), `smoke.ts` (tool-stack smoke test against a mock API) and `conformance.ts` (MCP conformance suite). |
| `tests/`, `e2e/` | Vitest suites. |

## Components

### CLI and lifecycle (`src/server.ts`)

`frontal-mcp-server --transport stdio|http` loads the config, creates a
`FrontalMcpServer`, and starts one transport. On `SIGTERM` or `SIGINT` it stops
the transport and closes the server, with a 10-second grace period.

### MCP server (`src/mcp/index.ts`)

`FrontalMcpServer` owns the shared, long-lived pieces: the `FrontalClient`, the
`SpecIndex`, the logger and the config. Together they form the `AdapterContext`
that every tool receives.

- `initialize()` builds the shared context and starts the `HealthMonitor`.
- `createServer()` builds a fresh `McpServer` with the enabled adapters. It is
  the factory behind both transports: stdio calls it once per connection, HTTP
  once per request. It also sets the discovery metadata (name, version, the
  enabled tool sets, the docs URL) and the cache hints.
- `connectStdio()` serves stdio through the SDK's `serveStdio`.

### Spec index (`src/spec/spec-index.ts`)

Indexes `openapi/public.v1.json` at startup:

- **Operation catalog:** normalised `{ operationId, method, path, tags,
  parameters, requestBody, responses, requiresAuth }`.
- **Lookup:** by `operationId` and by `METHOD path`, plus tag and free-text
  listing.
- **`$ref` resolution:** dereferencing guarded against cycles and capped at
  12 levels, used by `frontal_describe_endpoint`.

Refresh the vendored spec with `bun run sync-spec`. `bun run sync-spec:check`
compares it against the Frontal monorepo checked out beside this repository,
so it is a local check and does not run in CI.

### Tool adapters (`src/tools/`)

Each adapter implements `ServiceAdapter` and is registered only when its
toolset is listed in `FRONTAL_TOOLSETS` (default: all six).

```typescript
interface AdapterContext {
  client: FrontalClient;
  spec: SpecIndex;
  logger: Logger;
  config: ServerConfig;
  getToken(): string | undefined; // per-request bearer (HTTP) or env key (stdio)
}

interface ServiceAdapter {
  name: string;
  toolset: Toolset; // "generic" | "ontology" | "data" | "workflows" | "integrations" | "events"
  register(server: McpServer, ctx: AdapterContext): void;
}
```

- **Generic adapter:** `frontal_list_endpoints`, `frontal_describe_endpoint`
  and `frontal_call_endpoint`. These cover every operation in the spec without
  one tool per operation. `frontal_call_endpoint` can call any HTTP method.
- **Curated adapters:** `ontology` (10 tools), `data` (11), `workflows` (4),
  `integrations` (7) and `events` (3), with zod input schemas. Each tool is a
  `CuratedToolDef` that names a real `operationId`, declares its safety
  annotations, and maps the tool arguments to path parameters, query and
  body. `registerCuratedTool` is the drift guard: if the `operationId` is
  missing from the spec, the tool is skipped with a warning.

All tools call the API through `callOperation` in `tool-helpers.ts`, which
resolves the operation, substitutes path parameters, checks that a token is
present when the operation requires auth, and returns the response as JSON
text. Errors become MCP tool errors through `toToolError`, which adds hints
for 401 (API key), 409 (region) and 501 (feature not enabled).

### Tool safety (`src/tools/policy.ts`, `src/tools/curated.ts`)

- **Annotations.** `CuratedToolDef.annotations` is required, so a tool cannot
  be added without declaring what it does. The presets are `read`, `create`,
  `destructive`, `externalProbe` and `unrestricted`. `openWorldHint` is `true`
  only for tools that reach systems outside Frontal.
- **What counts as read-only.** Not the HTTP method alone. An operation only
  reads if it is a `GET`, or if it is on `READ_ONLY_POST_OPERATIONS`, an
  explicit allow-list of `POST` searches, queries and graph traversals.
  Registration fails if a tool declares `readOnlyHint` on any other operation.
- **Read-only mode** (`FRONTAL_READ_ONLY=true`). Curated tools that write are
  not registered. `frontal_call_endpoint` stays, but refuses any operation
  that the same rule does not classify as read-only; for a path that is not
  in the spec it allows safe HTTP methods only.
- **Confirmation.** A tool with a `confirm` question (`data_create_pipeline`,
  `data_ingest_dataset`) returns an `input_required` elicitation and runs
  only on an explicit yes. This applies when the client supports elicitation:
  always checkable on 2026-07-28, and on 2025-era stdio connections. A
  stateless 2025-era HTTP request cannot be asked, so the tool runs and the
  host's approval UI covers it. The confirmation is a courtesy to the user,
  not an access control.
- **Structured output.** `deriveOutputSchema` builds a tool's `outputSchema`
  from the operation's 2xx response schema, and the SDK then validates
  `structuredContent` against it. A schema that says nothing about its fields
  is skipped. Today every response in the vendored spec is
  `{ "type": "object", "additionalProperties": true }`, so no tool advertises
  an `outputSchema` yet; tools still return the response as
  `structuredContent`, alongside the JSON text.

### Frontal client (`src/client.ts`)

A `fetch`-based client:

- sends `Authorization: Bearer <token>` and, when a region is configured,
  `x-frontal-region`;
- retries 429, 502, 503 and 504 up to 3 attempts, with exponential backoff and
  jitter, honouring `Retry-After`;
- sends `x-frontal-idempotency-key` on writes (the caller's key, or a
  generated UUID) so retries are safe;
- times out each request after 35 seconds;
- follows cursor pagination for up to 100 pages (`paginate`);
- parses the API's error envelopes into `FrontalApiError`.

### Configuration (`src/config/`, `src/types/config.ts`)

Environment variables are validated with zod through `@t3-oss/env-core`
(`src/config/env.ts`). `loadConfig` merges them with CLI flags and an optional
JSON config file into a `ServerConfig`:

```typescript
interface ServerConfig {
  apiKey: string;      // FRONTAL_API_KEY (frt_...)
  baseUrl: string;     // FRONTAL_BASE_URL (bare host, no /v1 suffix)
  region: string;      // FRONTAL_REGION -> x-frontal-region
  toolsets: Toolset[]; // FRONTAL_TOOLSETS
  transport: TransportConfig;
  auth: AuthConfig;
  incidentio: IncidentioConfig;
  rateLimit: RateLimitConfig;
  logLevel: LogLevel;
  verbose: boolean;
}
```

### Health monitor (`src/services/`)

`HealthMonitor` reports the server's status to an incident.io status page. It
is active only when `INCIDENTIO_API_KEY` is set; otherwise it does nothing.

## Transports

The server uses the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`). Both
transports serve two protocol eras from the same factory:

- **Modern:** revision `2026-07-28`. There is no handshake; every request
  carries the protocol version and client capabilities in `_meta`, and
  `server/discover` returns the server's capabilities.
- **Legacy:** `2025-11-25` and earlier 2025-era versions, which start with the
  `initialize` handshake.

### stdio

For local clients such as Claude Desktop. `serveStdio` reads the client's
opening message, picks the era, and pins one `McpServer` to the connection.
The API key comes from `FRONTAL_API_KEY` (or `--api-key`). Logs go to stderr,
so stdout carries only protocol messages.

### Streamable HTTP (`src/middlewares/http-transport.ts`)

A `node:http` server for multi-tenant, remote use. Every path other than
`/health` is treated as the MCP endpoint.

The transport is **stateless**. It holds no sessions and no per-client data:
the SDK's `createMcpHandler` builds a fresh `McpServer` for every request, in
both eras (the legacy posture is `'stateless'`). Any instance can serve any
request, so the server can run as several instances behind a load balancer,
and nothing is lost when an instance stops. `GET` and `DELETE` on the MCP
endpoint, the session operations of the 2025-era transport, return `405`.

`http-transport.ts` itself only handles what surrounds the protocol. Each
request passes these checks, in order:

1. **CORS.** `Access-Control-Allow-Origin` is echoed only for an origin listed
   in `FRONTAL_HTTP_ALLOWED_ORIGINS`. It is never `*`. The MCP headers
   `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` are allowed and
   exposed, along with the `RateLimit-*` headers and `Retry-After`.
2. **Host allow-list.** When `FRONTAL_HTTP_ALLOWED_HOSTS` is set, requests with
   any other `Host` header get `403`. This blocks DNS rebinding.
3. **Health.** `GET /health` returns `200 {"status":"ok"}` without a token.
4. **Authentication.** Every MCP request must carry
   `Authorization: Bearer frt_...`; otherwise it gets `401`. The
   `FRONTAL_API_KEY` environment fallback is stdio-only and is never used to
   serve an HTTP request.
5. **Rate limiting.** When Upstash Redis is configured, requests are limited
   per caller, keyed by a hash of the token. Responses carry `RateLimit-*`
   headers, and a limited request gets `429` with `Retry-After`. If Redis is
   unreachable, the request is allowed.
6. **Body size.** Bodies above `FRONTAL_HTTP_MAX_BODY_BYTES` (default 4 MiB)
   get `413`.

The request is then converted to a web `Request` and passed to the MCP handler
inside `runWithToken`, which stores the caller's token in `AsyncLocalStorage`
so that `ctx.getToken()` returns it for the tool calls of that request only.
The handler's response is streamed back, so SSE responses work.

Each authenticated MCP request is counted by protocol era and logged as
`mcp_request era=<modern|legacy|rejected> status=<code> duration_ms=<n>`.
This is how the share of 2025-era traffic is measured; see
`docs/MIGRATION-2026-07-28.md` for the retirement policy.

### Caching and discovery

On the modern era, `tools/list` and `server/discover` results carry
`ttlMs: 300000` and `cacheScope: "private"`. The tool list is the same for
every caller today, but it is marked private because every request is
authenticated and later work gates tools by the caller's scopes.

## Request flow

```
MCP client
  → transport (stdio, or HTTP after the checks above)
  → McpServer → tool handler
  → callOperation → FrontalClient
  → api.frontal.dev
```

## Deployment

- **Docker:** `Dockerfile` builds with Bun and runs the built CLI on Node 22
  with the HTTP transport on port 3000.
- **Fly.io:** `fly.toml`, with a `/health` check. See
  `infrastructure/fly/`.
- **Other targets:** Kubernetes manifests, Terraform and monitoring
  configuration are under `infrastructure/`.

## Testing

- `tests/unit/`: unit tests for the client, config, spec index, tool layer,
  transports and services.
- `tests/integration/protocol-smoke.test.ts`: drives the server with a real
  MCP client over both stdio (the spawned CLI) and HTTP, in both protocol
  eras, against a local mock of the Frontal API.
- `tests/integration/statelessness.test.ts`: one client whose requests
  alternate between two server instances, in both eras.
- `scripts/conformance.ts` (`bun run conformance`): runs the applicable
  scenarios of the MCP conformance suite against the HTTP transport, in both
  eras.
- `scripts/smoke.ts` (`bun run smoke`): calls the tool handlers directly
  against a mock API, or the live API when `FRONTAL_API_KEY` is set.
- `e2e/`: CLI tests that run against the built `dist/`.

## Adding a curated tool

1. Find the operation's `operationId` in `openapi/public.v1.json` (or with
   `frontal_list_endpoints`).
2. Add a `CuratedToolDef` to the adapter's `TOOLS` list, with a zod input
   schema and a `map` function from tool arguments to path parameters, query
   and body.
3. Run `bun run test`. `tests/unit/adapters/curated-contract.test.ts` fails if
   any curated tool points at an `operationId` that is not in the spec.
