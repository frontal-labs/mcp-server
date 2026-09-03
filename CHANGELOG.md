# Changelog

## 2.0.0

### Major Changes

- f900959: Rename `EnhancedHttpTransport` to `HttpTransport`.

  **Breaking:** the public export `EnhancedHttpTransport` is now `HttpTransport`,
  and `EnhancedHttpTransportOptions` is now `HttpTransportOptions`. No alias is
  kept. Consumers importing either name from `@frontal-labs/mcp-server` must
  update the identifier; behaviour and the constructor signature are unchanged.

  The module also moves from `src/server/enhanced-http-transport.ts` to
  `src/server/http-transport.ts`, which matters only for deep imports into
  `src/`.

  There is one HTTP transport, so "Enhanced" distinguished it from nothing and
  read as a leftover from an earlier revision.

### Minor Changes

- aa63a76: Address post-merge review of the api.frontal.dev rebuild (follow-up to #84).

  Behavior changes (review before release — these tighten the HTTP contract):

  - **HTTP transport now requires a per-request `Authorization: Bearer frt_...`
    header** and returns `401` when it is missing. It no longer falls back to the
    server's `FRONTAL_API_KEY` (that key is stdio-only). `GET /health` stays
    public.
  - **CORS no longer replies with `*`.** `Access-Control-Allow-Origin` is echoed
    only for origins listed in the new `FRONTAL_HTTP_ALLOWED_ORIGINS` env var
    (empty by default → no browser origin trusted). Non-browser callers are
    unaffected.
  - **Minimum Node runtime raised to `>=22`**; `@types/node` pinned to the Node 22
    major to type against the supported floor.

  Fixes:

  - Thread a stable `idempotencyKey` through `frontal_call_endpoint` /
    `callOperation` so retried writes can be deduped by the edge.
  - Preserve `/` in path parameters so catch-all routes are not `%2F`-collapsed.
  - Parse the identity/IAM error envelope (`{ code, msg, error_code }`) so auth
    endpoint errors surface real messages instead of the generic fallback.
  - Discover the any-method engine routes (`/v1/adapter-services`, `/v1/runs`,
    `/v1/triggers`, `/v1/workflows`) via synthetic operations, and merge
    path-item-level parameters into each operation (OpenAPI 3.1).

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial MCP server implementation
- Service adapters for AI, Blob, Functions, Graph, and Pipelines
- CLI interface with stdio transport
- Configuration management with environment variables
- Comprehensive test suite
- API documentation

## [1.0.3] - 2026-07-25

### Added

- Development container configuration (.devcontainer/devcontainer.json)
- End-to-end smoke test (live + local mock edge modes)

### Changed

- Removed MCP configuration files (.mcp.json, biome.ignore)
- Removed redundant APPENDIX section from LICENSE.md
- Repository restructure: migrated from husky to pre-commit
- Updated dependencies (@types/node, @biomejs/biome, ultracite)
- Added incident.io status page integration with health monitoring
- Integrated Fly.io deployment into release pipeline
- Improved Docker image labeling and OCI compliance
- Enhanced security: use sigstore/cosign-installer with verified checksums
- Added production-grade release pipeline with GHCR, cosign, SBOM generation
- Improved Fly.io deployment: wait for CI, removed broken CodeQL step

### Fixed

- Quoted OCI label values to prevent Dockerfile parse errors
- Fixed workflow_dispatch tags input for docker metadata action
- Addressed CodeRabbit review feedback from PR #84
- Fixed OIDC publish issues and bumped version to 1.0.3 for testing
- Corrected version bump to 1.0.2

## [1.0.2] - 2024-03-XX

### Added

- Initial release features

## [1.0.1] - 2024-03-XX

### Added

- Patch release with minor fixes

## [1.0.0] - 2024-03-30

### Added

- Core MCP server implementation
- Frontal service adapters:
  - AI service (text generation, image generation, embeddings)
  - Blob storage (upload, list, delete)
  - Functions (invoke, list)
  - Graph database (query, create nodes)
  - Pipelines (create, run)
- Configuration management
- CLI with stdio transport
- TypeScript support
- Comprehensive testing
- Documentation

## [0.1.0] - 2024-03-15

### Added

- Project initialization
- Build system setup with tsup
- Development environment configuration
- Initial project structure
