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
import { describe, expect, it } from "vitest";
import { decodeTaskId, encodeTaskId } from "@/tasks/task-id.js";

const b64 = (text: string) => Buffer.from(text).toString("base64url");

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

describe("task ids", () => {
  it("round-trips a kind and a run id", () => {
    const taskId = encodeTaskId({ kind: "pipeline-run", runId: "run_123" });
    expect(taskId).toBe(b64("ft1:pipeline-run:run_123"));
    expect(decodeTaskId(taskId)).toEqual({
      kind: "pipeline-run",
      runId: "run_123",
    });
  });

  it("keeps colons that are part of the run id", () => {
    const ref = { kind: "ingest-run", runId: "urn:run:42" };
    expect(decodeTaskId(encodeTaskId(ref))).toEqual(ref);
  });

  it("is opaque: only base64url characters", () => {
    expect(encodeTaskId({ kind: "ingest-run", runId: "a/b+c=?" })).toMatch(
      /^[A-Za-z0-9_-]+$/
    );
  });

  it.each([
    ["an empty string", ""],
    ["text that is not base64url", "not a task id!"],
    ["another version", b64("ft2:ingest-run:run_1")],
    ["no version", b64("ingest-run:run_1")],
    ["no run id", b64("ft1:ingest-run:")],
    ["no kind", b64("ft1::run_1")],
    ["a kind with illegal characters", b64("ft1:Ingest_Run:run_1")],
    ["a run id with a space", b64("ft1:ingest-run:run 1")],
    ["a run id with a line break", b64("ft1:ingest-run:run\n1")],
    ["a path-shaped kind", b64("ft1:../ingest:run_1")],
    ["padded base64", `${b64("ft1:ingest-run:run_1")}=`],
    ["an oversized id", b64(`ft1:ingest-run:${"x".repeat(600)}`)],
  ])("rejects %s", (_label, taskId) => {
    expect(decodeTaskId(taskId)).toBeUndefined();
  });

  it("rejects a non-canonical encoding of a valid id", () => {
    // 22 bytes encode to 30 characters with unused bits in the last one.
    // Setting one of them gives a second spelling of the same bytes.
    const canonical = b64("ft1:ingest-run:run_123");
    const last = BASE64URL_ALPHABET.indexOf(canonical.at(-1) ?? "");
    const twisted = canonical.slice(0, -1) + BASE64URL_ALPHABET[last + 1];
    expect(Buffer.from(twisted, "base64url").toString()).toBe(
      "ft1:ingest-run:run_123"
    );
    expect(decodeTaskId(twisted)).toBeUndefined();
  });

  it("refuses to encode a malformed kind or run id", () => {
    expect(() => encodeTaskId({ kind: "Bad Kind", runId: "r" })).toThrow();
    expect(() => encodeTaskId({ kind: "ingest-run", runId: "" })).toThrow();
    expect(() => encodeTaskId({ kind: "ingest-run", runId: "a b" })).toThrow();
  });
});
