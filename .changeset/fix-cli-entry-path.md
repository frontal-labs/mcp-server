---
"@frontal-labs/mcp-server": patch
---

Fix the CLI entry point. The build now emits `dist/bin/frontal-mcp-server.js`, the path that the `bin` field, the Docker images and the docs already referenced; previously it emitted `dist/bin/index.js`, so `npx frontal-mcp-server` and the Docker image could not start.
