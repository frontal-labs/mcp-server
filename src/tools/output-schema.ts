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
 * Derives a tool `outputSchema` from an operation's response schema in the
 * vendored OpenAPI document.
 */
import type { OperationInfo, SpecIndex } from "@/spec/index.js";

/** Largest derived schema advertised in `tools/list`, in JSON characters. */
export const MAX_OUTPUT_SCHEMA_CHARS = 20_000;

type JsonObject = Record<string, unknown>;

/** Why an operation got no `outputSchema`. */
export type OutputSchemaSkipReason =
  | "no-json-response"
  | "not-an-object"
  | "too-loose"
  | "too-large";

export type DerivedOutputSchema =
  | { schema: JsonObject }
  | { skipped: OutputSchemaSkipReason };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The JSON schema of the first 2xx response, with `$ref`s resolved. */
function successSchema(spec: SpecIndex, op: OperationInfo): unknown {
  if (!isObject(op.responses)) return;
  const status = Object.keys(op.responses)
    .filter((code) => code.startsWith("2"))
    .sort()[0];
  if (!status) return;
  const response = spec.dereference(op.responses[status]);
  if (!isObject(response) || !isObject(response.content)) return;
  const json = response.content["application/json"];
  return isObject(json) ? spec.dereference(json.schema) : undefined;
}

/**
 * A schema describes the response only if it says something about its
 * fields. `{ "type": "object", "additionalProperties": true }` accepts any
 * object, so advertising it would tell a client nothing.
 */
function describesFields(schema: JsonObject): boolean {
  if (isObject(schema.properties)) {
    return Object.keys(schema.properties).length > 0;
  }
  return ["allOf", "anyOf", "oneOf"].some(
    (key) => Array.isArray(schema[key]) && (schema[key] as unknown[]).length > 0
  );
}

/**
 * Derive the `outputSchema` for a tool built on `op`, or say why there is
 * none. A tool result's `structuredContent` must be a JSON object, so only
 * object-typed response schemas qualify.
 */
export function deriveOutputSchema(
  spec: SpecIndex,
  op: OperationInfo
): DerivedOutputSchema {
  const schema = successSchema(spec, op);
  if (!isObject(schema)) return { skipped: "no-json-response" };
  if (schema.type !== "object") return { skipped: "not-an-object" };
  if (!describesFields(schema)) return { skipped: "too-loose" };
  if (JSON.stringify(schema).length > MAX_OUTPUT_SCHEMA_CHARS) {
    return { skipped: "too-large" };
  }
  return { schema };
}
