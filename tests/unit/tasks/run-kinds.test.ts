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
import { loadSpecIndex } from "@/spec/spec-index.js";
import { taskFromRun } from "@/tasks/handlers.js";
import {
  enabledRunKinds,
  RUN_KINDS,
  RunKindRegistry,
  readRunId,
  readRunState,
  validateRunKinds,
} from "@/tasks/run-kinds.js";
import { decodeTaskId } from "@/tasks/task-id.js";
import { TEST_RUN_KIND as KIND } from "../../fixtures/test-run-kind.js";

const spec = loadSpecIndex();

describe("the built-in run kinds", () => {
  it("are valid against the vendored spec", () => {
    expect(validateRunKinds(RUN_KINDS, spec)).toEqual([]);
  });
});

describe("validateRunKinds", () => {
  it("accepts a well-formed kind", () => {
    expect(validateRunKinds([KIND], spec)).toEqual([]);
  });

  it("reports every problem", () => {
    const problems = validateRunKinds(
      [
        KIND,
        { ...KIND, statusOperationId: "noSuchOperation" },
        {
          ...KIND,
          kind: "Bad Kind",
          startOperationId: "postV1DataPipelinesRuns",
          // An operation without a {run_id} path parameter.
          statusOperationId: "getV1DataIngestRuns",
          runIdFields: [],
          statuses: {},
        },
      ],
      spec
    ).join("\n");
    expect(problems).toMatch(/duplicate kind/);
    expect(problems).toMatch(/already starts a kind/);
    expect(problems).toMatch(/noSuchOperation is not in the spec/);
    expect(problems).toMatch(/kind name must match/);
    expect(problems).toMatch(/no \{run_id\} path parameter/);
    expect(problems).toMatch(/runIdFields is empty/);
    expect(problems).toMatch(/statuses is empty/);
  });
});

describe("RunKindRegistry", () => {
  it("finds a kind by name and by start operation", () => {
    const registry = new RunKindRegistry([KIND], spec);
    expect(registry.size).toBe(1);
    expect(registry.get("test-run")).toBe(KIND);
    expect(registry.forStartOperation(KIND.startOperationId)).toBe(KIND);
    expect(registry.get("other")).toBeUndefined();
    expect(registry.get("constructor")).toBeUndefined();
  });

  it("refuses an invalid set of kinds", () => {
    expect(() => new RunKindRegistry([KIND, KIND], spec)).toThrow(
      /Invalid run kinds/
    );
  });

  it("leaves out kinds whose tool set is disabled", () => {
    expect(enabledRunKinds([KIND], ["ontology"], spec).size).toBe(0);
    expect(enabledRunKinds([KIND], ["data"], spec).size).toBe(1);
  });
});

describe("reading a run", () => {
  it("takes the run id from the first field that has one", () => {
    expect(readRunId(KIND, { run: { id: "a" }, run_id: "b" })).toBe("a");
    expect(readRunId(KIND, { run_id: 7 })).toBe("7");
    expect(readRunId(KIND, { id: "c" })).toBeUndefined();
    expect(readRunId(KIND, "text")).toBeUndefined();
  });

  it("maps a status, and only a listed one", () => {
    expect(readRunState(KIND, { state: "done" })).toBe("succeeded");
    expect(readRunState(KIND, { state: "toString" })).toBeUndefined();
    expect(readRunState(KIND, { state: 3 })).toBeUndefined();
    expect(readRunState(KIND, {})).toBeUndefined();
  });
});

describe("taskFromRun", () => {
  const now = new Date("2026-11-16T12:00:00.000Z");

  it("describes a working run", () => {
    const task = taskFromRun(KIND, "run_1", { state: "running" }, now);
    expect(task).toMatchObject({
      status: "working",
      ttlMs: null,
      pollIntervalMs: 5000,
      createdAt: now.toISOString(),
      lastUpdatedAt: now.toISOString(),
      statusMessage: "Run status: running",
    });
    expect(decodeTaskId(task.taskId)).toEqual({
      kind: "test-run",
      runId: "run_1",
    });
  });

  it("uses the run's own timestamps when it has them", () => {
    const task = taskFromRun(
      KIND,
      "run_1",
      {
        state: "running",
        created_at: "2026-11-01T08:00:00Z",
        updated_at: "2026-11-01T08:05:00Z",
      },
      now
    );
    expect(task.createdAt).toBe("2026-11-01T08:00:00.000Z");
    expect(task.lastUpdatedAt).toBe("2026-11-01T08:05:00.000Z");
  });

  it("completes with the run as the tool result", () => {
    const run = { state: "done", rows: 3 };
    const task = taskFromRun(KIND, "run_1", run, now);
    expect(task).toMatchObject({
      status: "completed",
      result: { structuredContent: run },
    });
    expect(task).not.toHaveProperty("result.isError");
  });

  it("reports a failed run as a completed task with a tool error", () => {
    const run = { state: "error", error: { message: "bad file" } };
    expect(taskFromRun(KIND, "run_1", run, now)).toMatchObject({
      status: "completed",
      statusMessage: "bad file",
      result: { isError: true, structuredContent: run },
    });
  });

  it("reports a cancelled run", () => {
    expect(taskFromRun(KIND, "run_1", { state: "stopped" }, now).status).toBe(
      "cancelled"
    );
  });

  it("keeps a run with an unknown status working, and says what it saw", () => {
    expect(taskFromRun(KIND, "run_1", { state: "paused" }, now)).toMatchObject({
      status: "working",
      statusMessage: "Run status: paused",
    });
  });
});
