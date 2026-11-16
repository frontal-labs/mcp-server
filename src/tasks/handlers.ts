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
 * The MCP Tasks extension (`io.modelcontextprotocol/tasks`, 2026-07-28),
 * server side.
 *
 * The SDK has no Tasks runtime, so the three methods are registered here as
 * extension methods. The server keeps no task state: a task id names a run
 * in the Frontal API (see `task-id.ts`), and every request is answered by
 * asking the API with the caller's own token. Any instance can therefore
 * answer for a task that another instance started.
 */
import {
  type CreateTaskResultV2,
  type DetailedTaskV2,
  TASKS_EXTENSION_ID_V2,
} from "@modelcontextprotocol/ext-tasks/core/v2";
import {
  CLIENT_CAPABILITIES_META_KEY,
  type McpServer,
  ProtocolError,
  ProtocolErrorCode,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  DEFAULT_POLL_INTERVAL_MS,
  type RunKind,
  readPath,
  readRunId,
  readRunState,
} from "@/tasks/run-kinds.js";
import { decodeTaskId, encodeTaskId } from "@/tasks/task-id.js";
import { callOperation, toToolResult } from "@/tools/tool-helpers.js";
import type { AdapterContext } from "@/tools/types.js";
import { FrontalApiError } from "@/types/errors.js";

const HTTP_NOT_FOUND = 404;

/** Runs are kept by the API, not by this server, so tasks never expire here. */
const TASK_TTL_MS = null;

const taskIdParams = z.looseObject({ taskId: z.string() });

type JsonObject = Record<string, unknown>;

/**
 * Whether this request may be answered with a task. Only a 2026-07-28
 * request can say so: the capability travels in the request itself, and the
 * specification forbids returning a task to a client that did not declare it.
 */
export function clientSupportsTasks(toolCtx: ServerContext): boolean {
  const envelope = toolCtx.mcpReq.envelope as JsonObject | undefined;
  const capabilities = envelope?.[CLIENT_CAPABILITIES_META_KEY] as
    | { extensions?: JsonObject }
    | undefined;
  return capabilities?.extensions?.[TASKS_EXTENSION_ID_V2] !== undefined;
}

/** An ISO 8601 timestamp read from a run, or `fallback` when it has none. */
function timestamp(run: unknown, field: string | undefined, fallback: Date) {
  const value = field ? readPath(run, field) : undefined;
  const date =
    typeof value === "string" || typeof value === "number"
      ? new Date(value)
      : fallback;
  return (Number.isNaN(date.getTime()) ? fallback : date).toISOString();
}

function statusMessage(kind: RunKind, run: unknown): string | undefined {
  const message = kind.messageField
    ? readPath(run, kind.messageField)
    : undefined;
  if (typeof message === "string" && message !== "") return message;
  const status = readPath(run, kind.statusField);
  return typeof status === "string" ? `Run status: ${status}` : undefined;
}

/** The result a finished task carries: the run, as a tool result. */
type TaskResult = Extract<DetailedTaskV2, { status: "completed" }>["result"];

function runResult(run: unknown, isError: boolean): TaskResult {
  const result = toToolResult(run);
  // The run came from JSON, so the tool result built from it is JSON too.
  return (isError ? { ...result, isError } : result) as unknown as TaskResult;
}

/**
 * Describe a run as a task.
 *
 * A run that failed becomes a `completed` task whose result is a tool error:
 * the specification reserves the `failed` status for JSON-RPC errors. A run
 * whose status is missing or unknown is reported as still working, with the
 * raw status in `statusMessage`, so that a new status value in the API does
 * not end a task early.
 */
export function taskFromRun(
  kind: RunKind,
  runId: string,
  run: unknown,
  now = new Date()
): DetailedTaskV2 {
  const createdAt = timestamp(run, kind.createdAtField, now);
  const message = statusMessage(kind, run);
  const base = {
    taskId: encodeTaskId({ kind: kind.kind, runId }),
    createdAt,
    lastUpdatedAt: timestamp(run, kind.updatedAtField, new Date(createdAt)),
    ttlMs: TASK_TTL_MS,
    ...(message ? { statusMessage: message } : {}),
  };
  const working = {
    ...base,
    status: "working" as const,
    pollIntervalMs: kind.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  };
  switch (readRunState(kind, run)) {
    case "succeeded":
      return { ...base, status: "completed", result: runResult(run, false) };
    case "failed":
      return {
        ...base,
        status: "completed",
        result: runResult(run, true),
      };
    case "cancelled":
      return { ...base, status: "cancelled" };
    default:
      return working;
  }
}

/**
 * The result of a `tools/call` that started a run: the task that tracks it.
 * The run is already in a terminal state when the API finished it at once;
 * the client learns that from its first `tasks/get`.
 */
export function createTaskResult(
  kind: RunKind,
  runId: string,
  run: unknown
): CreateTaskResultV2 {
  const { taskId, createdAt, lastUpdatedAt, ttlMs, status, statusMessage } =
    taskFromRun(kind, runId, run);
  return {
    resultType: "task",
    taskId,
    status,
    createdAt,
    lastUpdatedAt,
    ttlMs,
    pollIntervalMs: kind.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    ...(statusMessage ? { statusMessage } : {}),
  };
}

function taskNotFound(): ProtocolError {
  return new ProtocolError(
    ProtocolErrorCode.InvalidParams,
    "Failed to retrieve task: Task not found"
  );
}

/**
 * The specification defines no error for an operation a task does not
 * support, so this uses JSON-RPC "Method not found" with a reason a client
 * can match on.
 */
function notSupported(method: string, kind: RunKind): ProtocolError {
  return new ProtocolError(
    ProtocolErrorCode.MethodNotFound,
    `${method} is not supported for ${kind.kind} tasks`,
    { reason: "not_supported", method, kind: kind.kind }
  );
}

/**
 * Resolve a task id to its run kind. An id that is malformed, forged, or
 * names a kind this server does not offer is "not found": nothing about why
 * is revealed.
 */
function resolveTask(
  ctx: AdapterContext,
  taskId: string
): { kind: RunKind; runId: string } {
  const ref = decodeTaskId(taskId);
  const kind = ref ? ctx.runKinds?.get(ref.kind) : undefined;
  if (!(ref && kind)) throw taskNotFound();
  return { kind, runId: ref.runId };
}

/** Run a call to the API on behalf of a task request. */
async function forTask<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    // A run the caller's token cannot see is, to this caller, not a task.
    if (
      error instanceof FrontalApiError &&
      error.httpStatus === HTTP_NOT_FOUND
    ) {
      throw taskNotFound();
    }
    if (error instanceof ProtocolError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      `Failed to retrieve task: ${message}`
    );
  }
}

/**
 * Advertise the Tasks extension and serve `tasks/get`, `tasks/cancel` and
 * `tasks/update`. Call it only on a server instance that serves 2026-07-28,
 * and only when at least one run kind is enabled.
 */
export function registerTaskHandlers(
  server: McpServer,
  ctx: AdapterContext
): void {
  server.server.registerCapabilities({
    extensions: { [TASKS_EXTENSION_ID_V2]: {} },
  });

  server.server.setRequestHandler(
    "tasks/get",
    { params: taskIdParams },
    async ({ taskId }) => {
      const { kind, runId } = resolveTask(ctx, taskId);
      const run = await forTask(() =>
        callOperation(ctx, kind.statusOperationId, {
          pathParams: { [kind.runIdParam]: runId },
        })
      );
      return taskFromRun(kind, runId, run);
    }
  );

  server.server.setRequestHandler(
    "tasks/cancel",
    { params: taskIdParams },
    async ({ taskId }) => {
      const { kind, runId } = resolveTask(ctx, taskId);
      const { cancelOperationId } = kind;
      if (!cancelOperationId) throw notSupported("tasks/cancel", kind);
      await forTask(() =>
        callOperation(ctx, cancelOperationId, {
          pathParams: { [kind.runIdParam]: runId },
        })
      );
      return {};
    }
  );

  // No Frontal run accepts input while it runs.
  server.server.setRequestHandler(
    "tasks/update",
    { params: taskIdParams },
    ({ taskId }) => {
      throw notSupported("tasks/update", resolveTask(ctx, taskId).kind);
    }
  );
}

/**
 * The task for a run that a tool has just started, or `undefined` when the
 * tool should return the API response as usual: the operation starts no
 * known run kind, the client did not ask for tasks, or the response holds
 * no run id.
 */
export function taskForStartedRun(
  ctx: AdapterContext,
  toolCtx: ServerContext,
  operationId: string,
  response: unknown
): CreateTaskResultV2 | undefined {
  const kind = ctx.runKinds?.forStartOperation(operationId);
  if (!(kind && clientSupportsTasks(toolCtx))) return;
  const runId = readRunId(kind, response);
  if (runId === undefined) {
    ctx.logger.warn(
      `${operationId} returned no run id for run kind ${kind.kind}; returning the response instead of a task`
    );
    return;
  }
  return createTaskResult(kind, runId, response);
}
