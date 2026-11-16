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
import type { RunKind } from "@/tasks/run-kinds.js";

/**
 * A run kind for tests only.
 *
 * The operations are real, so the whole stack is exercised, but the payload
 * shape (`run_id`, `state` and its values) is invented and matches the mock
 * API in `tests/mocks/mock-edge.ts`. It says nothing about what the real
 * ingest service returns.
 */
export const TEST_RUN_KIND: RunKind = {
  kind: "test-run",
  toolset: "data",
  startOperationId: "postV1DataIngestDatasetsIngest",
  statusOperationId: "getV1DataIngestRunsRun_id",
  runIdParam: "run_id",
  runIdFields: ["run.id", "run_id"],
  statusField: "state",
  statuses: {
    queued: "working",
    running: "working",
    done: "succeeded",
    error: "failed",
    stopped: "cancelled",
  },
  createdAtField: "created_at",
  updatedAtField: "updated_at",
  messageField: "error.message",
};
