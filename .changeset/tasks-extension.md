---
"@frontal-labs/mcp-server": minor
---

Add the groundwork for long-running operations as MCP tasks (the `io.modelcontextprotocol/tasks` extension of protocol revision 2026-07-28).

- **Stateless tasks:** a task id encodes the run kind and the Frontal run id and nothing else, so any server instance can answer `tasks/get` for a task another instance started. Every task request calls the API with the caller's own token.
- **Run-kind registry:** each kind of run (start operation, status operation, optional cancel operation, status mapping) is one entry of data in `src/tasks/run-kinds.ts`. No kind is enabled yet, so no tool returns a task and the extension is not advertised until the first kind is added.
- **`tasks/cancel` and `tasks/update`** are refused as not supported: the API has no cancel endpoint and no run takes input.
- Clients that do not declare the extension, including all 2025-era clients, are unaffected.
