---
"@frontal-labs/mcp-server": major
---

Rename `EnhancedHttpTransport` to `HttpTransport`.

**Breaking:** the public export `EnhancedHttpTransport` is now `HttpTransport`,
and `EnhancedHttpTransportOptions` is now `HttpTransportOptions`. No alias is
kept. Consumers importing either name from `@frontal-labs/mcp-server` must
update the identifier; behaviour and the constructor signature are unchanged.

The module also moves from `src/server/enhanced-http-transport.ts` to
`src/server/http-transport.ts`, which matters only for deep imports into
`src/`.

There is one HTTP transport, so "Enhanced" distinguished it from nothing and
read as a leftover from an earlier revision.
