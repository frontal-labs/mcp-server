---
"@frontal-labs/mcp-server": minor
---

Address post-merge review of the api.frontal.dev rebuild (follow-up to #84).

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
