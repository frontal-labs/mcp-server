# Contributing to MCP Server

## Prerequisites

- **Bun**: Latest stable version
- **Node.js**: 20+

## Setup

```bash
bun install
```

## Development

```bash
bun run build        # Build the project
bun run lint         # Lint code
bun run format       # Format code
bun run test         # Run tests
bun run typecheck    # Type-check
```

## Conventional Commits

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(scope):` — New feature
- `fix(scope):` — Bug fix
- `docs(scope):` — Documentation
- `chore(scope):` — Maintenance
- `ci(scope):` — CI changes

## Pull Requests

1. Create a branch from `main`
2. Make your changes
3. Ensure lint and tests pass
4. Submit a PR to `main`

## Release

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.
