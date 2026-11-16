---
"@frontal-labs/mcp-server": major
---

Move to MCP protocol revision 2026-07-28 and the MCP TypeScript SDK v2, with a stateless HTTP transport.

The server now speaks 2026-07-28 and still serves 2025-era clients, on both stdio and HTTP. The HTTP transport keeps no sessions: every request is served by a fresh server instance, so the server can run as several instances behind a load balancer and nothing is lost when an instance stops. `tools/list` and `server/discover` results carry cache hints (`ttlMs: 300000`, `cacheScope: "private"`).

**Breaking changes**

- **HTTP sessions are removed.** No `Mcp-Session-Id` header is issued, and one sent by a client is ignored. A request with an unknown session id is no longer answered `404`, and the `503` "session limit" response is gone.
- **`GET` and `DELETE` on the MCP endpoint return `405`.** They were the session operations (the server-to-client event stream and session teardown).
- **`FRONTAL_HTTP_MAX_SESSIONS` is removed** and no longer read. Remove it from your environment. The `maxSessions` key of the `transport.http` config is removed too.
- **`HttpTransport` options `maxSessions`, `sessionIdleTimeoutMs` and `sessionSweepIntervalMs` are removed.** Its factory argument is now the SDK's `McpServerFactory`.
- **CORS headers changed.** `Mcp-Session-Id` is no longer allowed or exposed, and `DELETE` is no longer an allowed method. `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` and `Accept` are now allowed, and the three MCP headers are exposed.
- **Malformed JSON is answered `400`** with a JSON-RPC parse error (`-32700`), instead of `500`.
- **The SDK dependency changed** from `@modelcontextprotocol/sdk` (v1) to `@modelcontextprotocol/server` and `@modelcontextprotocol/core` (v2). The exported `McpServer` type and the type returned by `FrontalMcpServer.createServer()` are now the v2 class. Curated tool definitions (`CuratedToolDef.inputSchema`) take a `z.object(...)` instead of a raw zod shape.

Nothing changes for stdio users: the same command, flags and `FRONTAL_API_KEY` variable work as before.
