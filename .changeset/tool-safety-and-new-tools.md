---
"@frontal-labs/mcp-server": minor
---

Add tool safety annotations, a read-only mode, structured output, confirmation for write tools, and 14 curated tools.

- **Annotations:** every tool now declares `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`.
- **Read-only mode:** set `FRONTAL_READ_ONLY=true` to offer only tools that read. Write tools are not registered, and `frontal_call_endpoint` refuses any operation that is not a `GET` or on the explicit allow-list of read-only `POST` operations.
- **Structured output:** tools return the API response as `structuredContent` when it is a JSON object, as well as JSON text. A tool advertises an `outputSchema` when the OpenAPI spec describes its response.
- **Confirmation:** `data_create_pipeline` and `data_ingest_dataset` ask the user to confirm first when the client supports elicitation.
- **New tool sets**, enabled by default: `workflows` (`workflows_search`, `workflows_get_run`, `workflows_get_run_summary`, `workflows_get_run_timeline`), `integrations` (`integrations_get`, `integrations_list_capabilities`, `integrations_list_action_runs`, `action_runs_get`, `integrations_test_connection`, `connection_tests_get`, `providers_get`) and `events` (`events_list`, `events_get`, `events_query`). If you set `FRONTAL_TOOLSETS` explicitly, add them to get the new tools.
- **Protocol era logging:** the HTTP transport logs `mcp_request era=<modern|legacy|rejected> ...` for each MCP request and exposes the totals as `HttpTransport.requestCounts`.
- **Migration guide:** `docs/MIGRATION-2026-07-28.md`, including the policy for retiring 2025-era HTTP support.
