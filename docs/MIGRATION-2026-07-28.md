# Migrating to MCP 2026-07-28

This guide covers what changed when the Frontal MCP Server moved to MCP
protocol revision `2026-07-28` and the MCP TypeScript SDK v2, and how the
server will retire support for 2025-era clients.

## Summary

| You use | What changes |
| --- | --- |
| stdio (Claude Desktop and other local clients) | Nothing. The same command, flags and `FRONTAL_API_KEY` work. |
| HTTP with a current MCP client library | Nothing you need to do. The client negotiates `2026-07-28` by itself. |
| HTTP with a 2025-era client | It keeps working, without sessions. See [HTTP clients](#http-clients). |
| Self-hosted deployments | Remove `FRONTAL_HTTP_MAX_SESSIONS`. See [Removed configuration](#removed-configuration). |

## Protocol versions

The server speaks two protocol eras from the same tools:

- **Modern:** `2026-07-28`. There is no `initialize` handshake. Every request
  carries the protocol version and the client's capabilities, and
  `server/discover` returns the server's capabilities.
- **Legacy:** `2025-11-25` and earlier 2025-era versions, which start with
  `initialize`.

## stdio users

Nothing changes. The client's first message selects the era, and the server
serves that connection in it.

## HTTP clients

The HTTP transport no longer has sessions. Each request is complete in itself
and can be served by any instance.

- **No `Mcp-Session-Id`.** The server does not issue one. If your client still
  sends one, it is ignored. You no longer get `404` for an unknown session, or
  `503` when a session limit is reached.
- **`GET` and `DELETE` on the MCP endpoint return `405`.** They were the
  session operations: the server-to-client event stream, and session teardown.
  Stop calling them.
- **Modern requests need three headers:** `MCP-Protocol-Version`, `Mcp-Method`
  and `Mcp-Name`. MCP client libraries send them for you. Browser clients can
  send and read them: they are allowed and exposed over CORS for origins in
  `FRONTAL_HTTP_ALLOWED_ORIGINS`.
- **Malformed JSON is answered `400`** with a JSON-RPC parse error (`-32700`).
  It used to be `500`.
- **Authentication is unchanged.** Every MCP request still needs
  `Authorization: Bearer frt_...`. `GET /health` still needs no token.

## Removed configuration

| Setting | Replacement |
| --- | --- |
| `FRONTAL_HTTP_MAX_SESSIONS` | None. It is no longer read; remove it. There are no sessions to limit. |
| `transport.http.maxSessions` (config file) | None. Remove it. |

## New configuration

| Setting | Default | What it does |
| --- | --- | --- |
| `FRONTAL_READ_ONLY` | `false` | When `true`, tools that write are not offered, and `frontal_call_endpoint` refuses every operation that is not known to only read. |
| `FRONTAL_TOOLSETS` | all six | Three tool sets were added: `workflows`, `integrations` and `events`. If you set this variable explicitly, add them to get the new tools. |

## Retiring 2025-era HTTP support

The server answers 2025-era HTTP requests through a stateless fallback (the
SDK's `legacy: 'stateless'` posture). That fallback will be switched off
(`legacy: 'reject'`), after which a 2025-era HTTP request gets an
"unsupported protocol version" error.

**Policy.** The switch happens only when both of these hold:

1. The date is **2027-07-28 or later**.
2. Legacy-era HTTP traffic has been **below 5% of served MCP requests for 30
   consecutive days**.

Neither condition alone is enough. stdio is not affected by this policy.

**How the share is measured.** The HTTP transport writes one log line for
every authenticated MCP request:

```text
mcp_request era=legacy status=200 duration_ms=12
```

`era` is `modern` (2026-07-28), `legacy` (a 2025-era request that was served),
or `rejected` (answered before any server was built: `GET`, `DELETE`, a
malformed envelope, or an unsupported version). The share to track is:

```text
legacy / (legacy + modern)
```

computed per day from these lines. The line carries no token, request body or
tool argument. The running totals since process start are also available in
code as `HttpTransport.requestCounts`.

**What to do before then.** Upgrade HTTP clients to a library that speaks
`2026-07-28`. A client is on the legacy path if its requests appear as
`era=legacy`.
