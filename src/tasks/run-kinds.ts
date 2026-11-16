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
 * The run-kind registry.
 *
 * Many Frontal services share one shape for long work: a `POST` that starts
 * a run and a `GET …/runs/{run_id}` that reports on it. A run kind describes
 * one such pair as data, so that a tool built on the start operation can
 * hand back an MCP task, and `tasks/get` can answer for it from any server
 * instance. Supporting another service is a new entry in `RUN_KINDS`, not
 * new code.
 */
import type { SpecIndex } from "@/spec/index.js";
import { RUN_KIND_PATTERN } from "@/tasks/task-id.js";
import type { Toolset } from "@/types/config.js";

/** Where a run stands, independent of how each service names its statuses. */
export type RunState = "working" | "succeeded" | "failed" | "cancelled";

export interface RunKind {
  /**
   * Operation that cancels a run. Optional: no service has one today, and
   * `tasks/cancel` is refused for a kind without it.
   */
  cancelOperationId?: string;
  /** Field of the run that holds its creation time. Dot path. */
  createdAtField?: string;
  /** Name used in task ids, for example `pipeline-run`. Never rename one. */
  kind: string;
  /** Field of the run that explains its status, for example an error. Dot path. */
  messageField?: string;
  /** How often a client should poll, in milliseconds. */
  pollIntervalMs?: number;
  /**
   * Fields of the start operation's response that may hold the run id. Dot
   * paths; the first one that holds a string or number wins.
   */
  runIdFields: string[];
  /** Path parameter of the status (and cancel) operation that takes the run id. */
  runIdParam: string;
  /** Operation that starts a run. A curated tool on it becomes task-capable. */
  startOperationId: string;
  /** Every status value the service reports, and what it means. */
  statuses: Record<string, RunState>;
  /** Field of the run that holds its status. Dot path. */
  statusField: string;
  /** Operation that fetches a run by id. */
  statusOperationId: string;
  /** Tool set the kind belongs to; it is offered only when that set is enabled. */
  toolset: Toolset;
  /** Field of the run that holds its last update time. Dot path. */
  updatedAtField?: string;
}

/**
 * The run kinds this server offers as tasks.
 *
 * Empty on purpose. The OpenAPI document does not describe run payloads
 * (every response is an untyped object), so the id field, the status field
 * and the status values of each kind must come from responses recorded
 * against the API (`bun run record-run-fixtures`, stored under
 * `tests/fixtures/runs/`), never from a guess.
 */
export const RUN_KINDS: readonly RunKind[] = [];

export const DEFAULT_POLL_INTERVAL_MS = 5000;

/** Read a dot path such as `run.id` from an API response. */
export function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path.split(".")) {
    if (typeof current !== "object" || current === null) return;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** The run id in a start operation's response, if it has one. */
export function readRunId(
  kind: RunKind,
  response: unknown
): string | undefined {
  for (const field of kind.runIdFields) {
    const value = readPath(response, field);
    if (typeof value === "string" && value !== "") return value;
    if (typeof value === "number") return String(value);
  }
}

/**
 * The state of a run, or `undefined` when its status is missing or is a
 * value the kind does not list.
 */
export function readRunState(
  kind: RunKind,
  run: unknown
): RunState | undefined {
  const status = readPath(run, kind.statusField);
  return typeof status === "string" && Object.hasOwn(kind.statuses, status)
    ? kind.statuses[status]
    : undefined;
}

/** What is wrong with a set of run kinds, as one message per problem. */
export function validateRunKinds(
  kinds: readonly RunKind[],
  spec: SpecIndex
): string[] {
  const problems: string[] = [];
  const seenKinds = new Set<string>();
  const seenStarts = new Set<string>();
  for (const kind of kinds) {
    const name = kind.kind;
    if (!RUN_KIND_PATTERN.test(name)) {
      problems.push(`${name}: the kind name must match ${RUN_KIND_PATTERN}`);
    }
    if (seenKinds.has(name)) problems.push(`${name}: duplicate kind`);
    seenKinds.add(name);
    if (seenStarts.has(kind.startOperationId)) {
      problems.push(`${name}: ${kind.startOperationId} already starts a kind`);
    }
    seenStarts.add(kind.startOperationId);

    problems.push(...operationProblems(kind, spec));
    if (kind.runIdFields.length === 0) {
      problems.push(`${name}: runIdFields is empty`);
    }
    if (Object.keys(kind.statuses).length === 0) {
      problems.push(`${name}: statuses is empty`);
    }
  }
  return problems;
}

/** Operations of a kind that are missing from the spec or take no run id. */
function operationProblems(kind: RunKind, spec: SpecIndex): string[] {
  const problems: string[] = [];
  const runIdParam = `{${kind.runIdParam}}`;
  const operations = [
    { operationId: kind.startOperationId, takesRunId: false },
    { operationId: kind.statusOperationId, takesRunId: true },
    ...(kind.cancelOperationId
      ? [{ operationId: kind.cancelOperationId, takesRunId: true }]
      : []),
  ];
  for (const { operationId, takesRunId } of operations) {
    const op = spec.getByOperationId(operationId);
    if (!op) {
      problems.push(
        `${kind.kind}: operationId ${operationId} is not in the spec`
      );
    } else if (takesRunId && !op.path.includes(runIdParam)) {
      problems.push(
        `${kind.kind}: ${operationId} has no ${runIdParam} path parameter`
      );
    }
  }
  return problems;
}

export class RunKindRegistry {
  private readonly byKind = new Map<string, RunKind>();
  private readonly byStart = new Map<string, RunKind>();

  /**
   * @throws when a kind is malformed or names an operation that is not in
   * the spec. A bad registry is a build error, not something to serve.
   */
  constructor(kinds: readonly RunKind[], spec: SpecIndex) {
    const problems = validateRunKinds(kinds, spec);
    if (problems.length > 0) {
      throw new Error(`Invalid run kinds:\n- ${problems.join("\n- ")}`);
    }
    for (const kind of kinds) {
      this.byKind.set(kind.kind, kind);
      this.byStart.set(kind.startOperationId, kind);
    }
  }

  get(kind: string): RunKind | undefined {
    return this.byKind.get(kind);
  }

  /** The kind whose runs `operationId` starts, if any. */
  forStartOperation(operationId: string): RunKind | undefined {
    return this.byStart.get(operationId);
  }

  get size(): number {
    return this.byKind.size;
  }
}

/** A registry of the kinds that belong to one of the enabled tool sets. */
export function enabledRunKinds(
  kinds: readonly RunKind[],
  toolsets: readonly Toolset[],
  spec: SpecIndex
): RunKindRegistry {
  return new RunKindRegistry(
    kinds.filter((kind) => toolsets.includes(kind.toolset)),
    spec
  );
}
