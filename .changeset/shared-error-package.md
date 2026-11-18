---
"@frontal-labs/mcp-server": minor
---

Build the server's errors on `@frontal-labs/error`.

`FrontalError`, `FrontalApiError`, `ConfigError`, `SpecError` and `ToolInputError` now extend the shared `FrontalError` class from `@frontal-labs/error`, so they carry the same `scope` (`mcp-server`), `code`, `hint` and `statusCode` fields as the CLI and the TypeScript SDK. The existing fields (`httpStatus`, `retryable`, `details`, `requestId`, `context`, `kind`) are unchanged.

The hints shown with tool errors are unchanged: 401 (API key), 409 (region) and 501 (feature not enabled). They are now set on the error itself as `hint`, and are also available from the new `hintForStatus` export.
