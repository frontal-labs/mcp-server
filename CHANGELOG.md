# Changelog

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
