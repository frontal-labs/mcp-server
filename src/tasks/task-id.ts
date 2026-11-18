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
 * Task ids.
 *
 * A task id is `base64url("ft1:<kind>:<runId>")`. It names a run in the
 * Frontal API and nothing else: no token, no tenant and no URL. That is what
 * lets any server instance answer for any task without shared state. It is
 * not a credential either: every task request calls the API with the
 * caller's own token, so the API decides whether the caller may see the run.
 */

/** Version tag of the id layout. Bump it when the layout changes. */
const TASK_ID_VERSION = "ft1";

/** Longest task id accepted, in characters. Real ids are far shorter. */
const MAX_TASK_ID_LENGTH = 512;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** The shape of a run kind name, for example `pipeline-run`. */
export const RUN_KIND_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/** Printable ASCII without spaces: the characters a run id may contain. */
const RUN_ID_PATTERN = /^[\x21-\x7e]+$/;

export interface TaskRef {
  kind: string;
  runId: string;
}

export function encodeTaskId({ kind, runId }: TaskRef): string {
  if (!RUN_KIND_PATTERN.test(kind)) {
    throw new Error(`Invalid run kind: ${kind}`);
  }
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error("A run id must be non-empty printable ASCII");
  }
  const id = Buffer.from(`${TASK_ID_VERSION}:${kind}:${runId}`).toString(
    "base64url"
  );
  if (id.length > MAX_TASK_ID_LENGTH) {
    throw new Error("The run id is too long to encode as a task id");
  }
  return id;
}

/**
 * Decode a task id, or return `undefined` when it is not one of ours. The
 * caller still has to check that the kind is one it knows.
 */
export function decodeTaskId(taskId: string): TaskRef | undefined {
  if (taskId.length > MAX_TASK_ID_LENGTH || !BASE64URL.test(taskId)) {
    return;
  }
  const decoded = Buffer.from(taskId, "base64url").toString("utf8");
  const [version, kind, ...rest] = decoded.split(":");
  // A run id may itself contain colons.
  const runId = rest.join(":");
  if (
    version !== TASK_ID_VERSION ||
    kind === undefined ||
    !RUN_KIND_PATTERN.test(kind) ||
    !RUN_ID_PATTERN.test(runId)
  ) {
    return;
  }
  // Accept only the canonical encoding, so one run has exactly one task id.
  if (encodeTaskId({ kind, runId }) !== taskId) return;
  return { kind, runId };
}
