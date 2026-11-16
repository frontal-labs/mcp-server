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
 * Tool safety policy: which operations only read, and the annotation
 * presets tools declare.
 */
import type { ToolAnnotations } from "@modelcontextprotocol/server";
import type { OperationInfo } from "@/spec/index.js";

/**
 * POST operations that only read: searches, queries and graph traversals
 * that take their input as a request body.
 *
 * The HTTP method alone does not say whether an operation writes, so this
 * list is explicit. A POST that is not listed here is treated as a write:
 * it is refused in read-only mode, and a curated tool built on it must not
 * declare `readOnlyHint`. Add an operation only after confirming with the
 * API's owners that it has no side effects.
 */
export const READ_ONLY_POST_OPERATIONS: ReadonlySet<string> = new Set([
  "postV1OntologyGraphGraphQuery",
  "postV1OntologyGraphGraphNeighborhood",
  "postV1OntologyGraphGraphPath",
  "postV1DataQueryQueryFederated",
  "postV1WorkflowsSearch",
  "postV1EventsQuery",
]);

/** HTTP methods that never write, whatever the operation. */
const SAFE_METHODS: ReadonlySet<string> = new Set(["get", "head"]);

/** Whether a bare HTTP method is safe to call in read-only mode. */
export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toLowerCase());
}

/** Whether an operation from the spec only reads. */
export function isReadOnlyOperation(
  op: Pick<OperationInfo, "method" | "operationId">
): boolean {
  return (
    isSafeMethod(op.method) || READ_ONLY_POST_OPERATIONS.has(op.operationId)
  );
}

/**
 * Annotation presets. `openWorldHint` is `true` only for tools that act on
 * systems outside Frontal (integration actions, connection tests); tools
 * that only touch Frontal data are closed-world.
 */
export const ANNOTATIONS = {
  /** Reads Frontal data and changes nothing. */
  read: { readOnlyHint: true, openWorldHint: false },
  /** Creates something new in Frontal; existing data is untouched. */
  create: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  /** May change or overwrite existing Frontal data. */
  destructive: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  /** Reaches a system outside Frontal, without changing data there. */
  externalProbe: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  /** Can do anything the API allows, including against external systems. */
  unrestricted: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
} as const satisfies Record<string, ToolAnnotations>;
