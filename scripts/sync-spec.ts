/*
 * Copyright 2026 Frontal Labs, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
#!/usr/bin/env bun
/**
 * Sync the vendored Frontal public OpenAPI spec.
 *
 * The MCP server vendors `src/spec/public.v1.json` so it has no build- or
 * run-time dependency on the frontal monorepo. This script refreshes that copy
 * from the bundled source of truth and can verify (in CI) that the vendored
 * copy is not stale.
 *
 * Usage:
 *   bun run scripts/sync-spec.ts                 # copy source -> vendored
 *   bun run scripts/sync-spec.ts --check         # exit 1 if versions differ
 *   FRONTAL_SPEC_SOURCE=/path/to/public.v1.json bun run scripts/sync-spec.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const VENDORED = resolve(REPO_ROOT, "openapi/public.v1.json");
const DEFAULT_SOURCE = resolve(
  REPO_ROOT,
  "../frontal/openapi/gen/bundled/public.v1.json"
);

interface SpecShape {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, unknown>;
}

function readSpec(path: string): SpecShape {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as SpecShape;
  } catch (error) {
    throw new Error(
      `Unable to read spec at ${path}: ${(error as Error).message}`
    );
  }
}

function versionOf(spec: SpecShape): string {
  return spec.info?.version ?? "unknown";
}

function pathCount(spec: SpecShape): number {
  return Object.keys(spec.paths ?? {}).length;
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const check = args.has("--check");
  const source = process.env.FRONTAL_SPEC_SOURCE ?? DEFAULT_SOURCE;

  const vendored = readSpec(VENDORED);

  if (check) {
    const src = readSpec(source);
    const vendoredVersion = versionOf(vendored);
    const sourceVersion = versionOf(src);
    if (vendoredVersion !== sourceVersion) {
      process.stderr.write(
        `Vendored spec is stale: vendored=${vendoredVersion} source=${sourceVersion}\n` +
          "Run `bun run scripts/sync-spec.ts` and commit the result.\n"
      );
      process.exit(1);
    }
    process.stdout.write(
      `Vendored spec is up to date (version ${vendoredVersion}, ${pathCount(vendored)} paths).\n`
    );
    return;
  }

  const src = readSpec(source);
  writeFileSync(VENDORED, `${JSON.stringify(src, null, 2)}\n`);
  process.stdout.write(
    `Synced public API spec: version ${versionOf(src)}, ${pathCount(src)} paths\n` +
      `  from: ${source}\n  to:   ${VENDORED}\n`
  );
}

main();
