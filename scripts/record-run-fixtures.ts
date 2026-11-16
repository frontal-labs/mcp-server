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

/**
 * Record what run payloads really look like.
 *
 * The OpenAPI document types every run response as a bare object, so the
 * run-kind registry (`src/tasks/run-kinds.ts`) cannot be filled in from it.
 * This script asks a test tenant instead and writes redacted samples to
 * `tests/fixtures/runs/`.
 *
 *   FRONTAL_STAGING_API_KEY=frt_… bun run record-run-fixtures
 *   FRONTAL_STAGING_API_KEY=frt_… bun run record-run-fixtures \
 *     --start postV1DataPipelinesRuns body.json
 *
 * Without `--start` it only reads: it lists each run family and keeps one
 * run per distinct status. With `--start` it also calls one start operation
 * with the given JSON body, which CREATES A RUN on the tenant, records the
 * response, and then looks that run up in every run family to show where it
 * lives.
 *
 * The key is read from the environment, sent only as the `Authorization`
 * header to the API, and never printed or written. Samples are redacted
 * before they are written: every string is replaced except status-like
 * values and timestamps. Review the files before committing them all the
 * same.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSpecIndex } from "../src/spec/spec-index.ts";

const DEFAULT_BASE_URL = "https://api.frontal.dev";
const OUT_DIR = resolve(import.meta.dirname, "../tests/fixtures/runs");
const LIST_LIMIT = 100;
const MAX_ARRAY_ITEMS = 2;
const REQUEST_TIMEOUT_MS = 30_000;

/** Run families to sample: a list operation and its fetch-by-id operation. */
const FAMILIES = [
  {
    name: "ingest-runs",
    list: "getV1DataIngestRuns",
    get: "getV1DataIngestRunsRun_id",
  },
  {
    name: "pipelines-runs",
    list: "getV1DataPipelinesRuns",
    get: "getV1DataPipelinesRunsRun_id",
  },
  {
    name: "pipelines-pipeline-runs",
    list: "getV1DataPipelinesPipeline_runs",
    get: "getV1DataPipelinesPipeline_runsRun_id",
  },
] as const;

/** Keys whose values are vocabulary, not tenant data. */
const STATUS_KEY =
  /status|state|phase|stage|outcome|result_type|kind|type|mode|trigger/i;
const STATUS_VALUE = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const ID_KEY = /(^|_)id$|Id$|^id$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const LIST_KEYS = ["items", "data", "runs", "results"];
const RUN_ID_KEYS = ["run_id", "id", "runId"];
const RUN_STATUS_KEYS = ["status", "state", "phase"];

type Json = Record<string, unknown>;

const spec = loadSpecIndex();
const baseUrl = (
  process.env.FRONTAL_STAGING_BASE_URL ?? DEFAULT_BASE_URL
).replace(/\/$/, "");
const apiKey = process.env.FRONTAL_STAGING_API_KEY ?? "";

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactString(key: string, value: string): string {
  if (ISO_TIMESTAMP.test(value)) return "2026-01-01T00:00:00Z";
  if (STATUS_KEY.test(key) && !ID_KEY.test(key) && STATUS_VALUE.test(value)) {
    return value;
  }
  return ID_KEY.test(key) ? "<id>" : "<redacted>";
}

/** Keep the shape and the vocabulary of a payload; drop everything else. */
export function redact(value: unknown, key = ""): unknown {
  if (typeof value === "string") return redactString(key, value);
  if (typeof value === "number") return ID_KEY.test(key) ? 0 : value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, key));
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, redact(item, name)])
    );
  }
  return value;
}

function pathOf(operationId: string, params: Record<string, string> = {}) {
  const op = spec.getByOperationId(operationId);
  if (!op) throw new Error(`Unknown operationId: ${operationId}`);
  const path = op.path.replace(/\{([^}]+)\}/g, (_, name: string) =>
    encodeURIComponent(params[name] ?? "")
  );
  return { method: op.method.toUpperCase(), path };
}

async function call(
  operationId: string,
  options: {
    body?: unknown;
    params?: Record<string, string>;
    query?: string;
  } = {}
): Promise<{ body: unknown; status: number }> {
  const { method, path } = pathOf(operationId, options.params);
  const response = await fetch(`${baseUrl}${path}${options.query ?? ""}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: keep the text.
  }
  say(`  ${method} ${path} → ${response.status}`);
  return { status: response.status, body };
}

function save(name: string, payload: unknown): void {
  const file = resolve(OUT_DIR, `${name}.json`);
  writeFileSync(file, `${JSON.stringify(redact(payload), null, 2)}\n`);
  say(`  wrote tests/fixtures/runs/${name}.json`);
}

/** The runs in a list response, wherever the service put them. */
function runsIn(body: unknown): Json[] {
  if (Array.isArray(body)) return body.filter(isObject);
  if (!isObject(body)) return [];
  for (const key of LIST_KEYS) {
    if (Array.isArray(body[key]))
      return (body[key] as unknown[]).filter(isObject);
  }
  return [];
}

function firstString(run: Json, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = run[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
}

async function sampleFamily(family: (typeof FAMILIES)[number]): Promise<void> {
  say(`\n${family.name}`);
  const list = await call(family.list, { query: `?limit=${LIST_LIMIT}` });
  save(`${family.name}.list`, list.body);
  const runs = runsIn(list.body);
  if (runs.length === 0) {
    say("  no runs found in the list response; see the .list file");
    return;
  }

  const byStatus = new Map<string, Json>();
  for (const run of runs) {
    const status = firstString(run, RUN_STATUS_KEYS) ?? "no-status-field";
    if (!byStatus.has(status)) byStatus.set(status, run);
  }
  say(
    `  ${runs.length} runs; statuses seen: ${[...byStatus.keys()].join(", ")}`
  );

  for (const [status, run] of byStatus) {
    const runId = firstString(run, RUN_ID_KEYS);
    if (!runId) {
      say(`  ${status}: no id field among ${RUN_ID_KEYS.join("/")}; skipped`);
      continue;
    }
    const one = await call(family.get, { params: { run_id: runId } });
    save(`${family.name}.${status.replace(/[^A-Za-z0-9_-]/g, "_")}`, one.body);
  }
}

/** Start a run, record the response, and find which family it lives in. */
async function startAndLocate(operationId: string, bodyFile: string) {
  say(`\nstart ${operationId} (this creates a run on the tenant)`);
  const body: unknown = JSON.parse(readFileSync(bodyFile, "utf8"));
  const started = await call(operationId, { body });
  save(`start.${operationId}`, started.body);

  const candidates = isObject(started.body)
    ? [started.body, ...Object.values(started.body).filter(isObject)]
    : [];
  const runId = candidates
    .map((candidate) => firstString(candidate, RUN_ID_KEYS))
    .find((id) => id !== undefined);
  if (!runId) {
    say(
      "  the response holds no run id under run_id/id/runId (top level or one level down)"
    );
    return;
  }
  say("  a run id was returned; looking it up in each run family:");
  for (const family of FAMILIES) {
    const found = await call(family.get, { params: { run_id: runId } });
    say(`    ${family.name}: ${found.status === 200 ? "FOUND" : "not found"}`);
  }
}

async function main(): Promise<void> {
  if (!apiKey) {
    throw new Error("Set FRONTAL_STAGING_API_KEY to a key for a test tenant.");
  }
  mkdirSync(OUT_DIR, { recursive: true });
  say(`Recording from ${new URL(baseUrl).host}`);

  const startAt = process.argv.indexOf("--start");
  if (startAt !== -1) {
    const [operationId, bodyFile] = process.argv.slice(startAt + 1);
    if (!(operationId && bodyFile)) {
      throw new Error("Usage: --start <operationId> <body.json>");
    }
    await startAndLocate(operationId, bodyFile);
  }
  for (const family of FAMILIES) {
    await sampleFamily(family);
  }
  say("\nDone. Review the files for tenant data before committing them.");
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
