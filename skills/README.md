# Skills

Agent Skills for this repo. `frontal-mcp` is ours; everything else is vendored
from skills.sh (see `skills-lock.json` at the repo root for upstream source,
path, and hash).

## Ours

- [frontal-mcp](./frontal-mcp/SKILL.md) — install, configure, and use this MCP server (toolsets, tools, transports, env vars).

## Vendored

Update with: `npx skills add <source> -s <skill> -y --copy`, then move
`.agents/skills/<skill>` to `skills/<skill>`. Pin result in `skills-lock.json`.

### Languages (TypeScript/JS)

| Skill | Source | Maps to |
|---|---|---|
| `typescript-advanced-types` | `wshobson/agents` | `src/` TS + Zod-validated inputs |
| `modern-javascript-patterns` | `wshobson/agents` | ESM (`"type": "module"`), async/await, tsup build |
| `javascript-testing-patterns` | `wshobson/agents` | vitest suite in `tests/` |
| `setup-ts-deep-modules` | `mattpocock/skills` | TS module structure |

### Tools (direct deps + toolchain)

| Skill | Source | Maps to |
|---|---|---|
| `upstash-redis-js` | `upstash/skills` | Dep `@upstash/redis` |
| `upstash-ratelimit-js` | `upstash/skills` | Dep `@upstash/ratelimit` |
| `find-docs` | `upstash/context7` | Current docs for MCP SDK, Zod v4, Commander, etc. |
| `nodejs-backend-patterns` | `wshobson/agents` | Node `>=22` server, stdio + Streamable HTTP transports |
| `openapi-spec-generation` | `wshobson/agents` | Vendored `openapi/public.v1.json` + `scripts/sync-spec.ts` |
| `auth-implementation-patterns` | `wshobson/agents` | Bearer `frt_` auth, per-request HTTP auth |
| `secrets-management` | `wshobson/agents` | `FRONTAL_API_KEY` env handling |
| `error-handling-patterns` | `wshobson/agents` | Edge retry matrix, `Retry-After` backoff, idempotency keys |
| `github-actions-templates` | `wshobson/agents` | CI (lint, type-check, coverage, build) |
| `changelog-automation` | `wshobson/agents` | Changesets release flow (`.changeset/`) |
| `deployment-pipeline-design` | `wshobson/agents` | `Dockerfile`, `fly.toml`, Fly.io deploy |
| `terraform-module-library` | `wshobson/agents` | `infrastructure/terraform/` |
| `k8s-manifest-generator` | `wshobson/agents` | `infrastructure/kubernetes/` |
| `e2e-testing-patterns` | `wshobson/agents` | `scripts/smoke.ts`, HTTP transport checks |

### Frameworks / structures

| Skill | Source | Maps to |
|---|---|---|
| `mcp-builder` | `anthropics/skills` | Building MCP servers (tools, adapters, transports) |
| `api-design-principles` | `wshobson/agents` | Curated (`ontology_*`, `data_*`) vs generic (`frontal_*`) tool design |
| `architecture-patterns` | `wshobson/agents` | Adapter/config/server layering (`ARCHITECTURE.md`) |
| `code-review-excellence` | `wshobson/agents` | Tool/adapter review rigor |
| `codebase-design` | `mattpocock/skills` | Service adapter structure (`src/adapters/`) |
| `improve-codebase-architecture` | `mattpocock/skills` | Refactor guidance |

### Workflow / quality

| Skill | Source | Maps to |
|---|---|---|
| `test-driven-development` | `obra/superpowers` | vitest TDD loop |
| `webapp-testing` | `anthropics/skills` | Unit/integration/e2e patterns |
| `systematic-debugging` | `obra/superpowers` | Bug investigation |
| `debugging-strategies` | `wshobson/agents` | Debugging + profiling |
| `diagnosing-bugs` | `mattpocock/skills` | Hard-bug diagnosis loop |
| `writing-plans` | `obra/superpowers` | Plan before multi-step work |
| `executing-plans` | `obra/superpowers` | Step-by-step plan execution |
| `verification-before-completion` | `obra/superpowers` | Verify before claiming done |
| `requesting-code-review` | `obra/superpowers` | Pre-merge review prep |
| `code-review` | `mattpocock/skills` | Branch/PR review |
| `finishing-a-development-branch` | `obra/superpowers` | Tests → commit → PR → review |
| `setup-pre-commit` | `mattpocock/skills` | Pre-commit hooks (repo uses pre-commit) |
| `skill-creator` | `anthropics/skills` | Authoring `frontal-mcp` and future skills |
| `find-skills` | `vercel-labs/skills` | Discovering more skills in-session |

## Conventions

- Each skill lives in `skills/<skill-name>/SKILL.md` with `name` + `description` frontmatter.
- Keep skills tool-focused: prefer the curated tools, fall back to the generic meta-tools for full API coverage.
- See the [main README](../README.md) and [docs](../docs/) for the full reference.
