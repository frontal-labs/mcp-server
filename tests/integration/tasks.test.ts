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
 * The Tasks extension, end to end, across two server instances.
 *
 * A tool starts a run on instance A; every later task request goes to
 * instance B, which has never seen the task. The requests are raw JSON-RPC:
 * the SDK client has no typed surface for the 2026-07-28 Tasks methods.
 *
 * The run kind and the run payloads are test doubles (see
 * `tests/fixtures/test-run-kind.ts`); only the protocol behaviour is real.
 */
import {
  CreateTaskResultV2Schema,
  GetTaskResultV2Schema,
  TASKS_EXTENSION_ID_V2,
} from "@modelcontextprotocol/ext-tasks/core/v2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decodeTaskId, encodeTaskId } from "@/tasks/task-id.js";
import { TEST_RUN_KIND } from "../fixtures/test-run-kind.js";
import { type MockEdge, startMockEdge } from "../mocks/mock-edge.js";
import {
  connectHttp,
  HTTP_TOKEN,
  type HttpServerUnderTest,
  MODERN_PROTOCOL_VERSION,
  startHttpServer,
  textOf,
} from "../utils/mcp-harness.js";

const OTHER_TENANT_TOKEN = "frt_other_tenant";
const INVALID_PARAMS = -32_602;
const METHOD_NOT_FOUND = -32_601;
const TASK_NOT_FOUND = "Failed to retrieve task: Task not found";

const TASKS_CAPABILITY = { extensions: { [TASKS_EXTENSION_ID_V2]: {} } };

interface RpcReply {
  error?: { code: number; data?: unknown; message: string };
  result?: Record<string, unknown>;
}

interface RpcOptions {
  capabilities?: Record<string, unknown>;
  token?: string;
}

/** One 2026-07-28 request, sent cold: no handshake, no client library. */
async function rpc(
  server: HttpServerUnderTest,
  method: string,
  params: Record<string, unknown>,
  { capabilities = TASKS_CAPABILITY, token = HTTP_TOKEN }: RpcOptions = {}
): Promise<RpcReply> {
  const name = params.name ?? params.taskId;
  const response = await fetch(`${server.url}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
      "MCP-Protocol-Version": MODERN_PROTOCOL_VERSION,
      "Mcp-Method": method,
      ...(typeof name === "string" ? { "Mcp-Name": name } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": MODERN_PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": {
            name: "tasks-test",
            version: "0",
          },
          "io.modelcontextprotocol/clientCapabilities": capabilities,
        },
      },
    }),
  });
  return (await response.json()) as RpcReply;
}

const startIngest = (server: HttpServerUnderTest, options?: RpcOptions) =>
  rpc(
    server,
    "tools/call",
    { name: "data_ingest_dataset", arguments: { request: { name: "orders" } } },
    options
  );

describe("tasks across two instances", () => {
  let edge: MockEdge;
  let instanceA: HttpServerUnderTest;
  let instanceB: HttpServerUnderTest;

  beforeAll(async () => {
    edge = await startMockEdge();
    [instanceA, instanceB] = await Promise.all([
      startHttpServer(edge, {}, {}, [TEST_RUN_KIND]),
      startHttpServer(edge, {}, {}, [TEST_RUN_KIND]),
    ]);
  });

  afterAll(async () => {
    await Promise.allSettled([instanceA?.stop(), instanceB?.stop()]);
    await edge?.close();
  });

  beforeEach(() => {
    edge.runs.clear();
  });

  /** Start a run on instance A and return its task id and run id. */
  async function startTask(): Promise<{ runId: string; taskId: string }> {
    const { result } = await startIngest(instanceA);
    const task = CreateTaskResultV2Schema.parse(result);
    const ref = decodeTaskId(task.taskId);
    if (!ref) throw new Error("the server returned an undecodable task id");
    return { taskId: task.taskId, runId: ref.runId };
  }

  function setRun(runId: string, body: Record<string, unknown>): void {
    const run = edge.runs.get(runId);
    if (!run) throw new Error(`no such run: ${runId}`);
    run.body = body;
  }

  it("advertises the extension in server/discover", async () => {
    const { result } = await rpc(instanceA, "server/discover", {});
    expect(result?.capabilities).toMatchObject(TASKS_CAPABILITY);
  });

  it("answers a tool that starts a run with a task", async () => {
    const { result } = await startIngest(instanceA);
    const task = CreateTaskResultV2Schema.parse(result);

    expect(task.resultType).toBe("task");
    expect(task.status).toBe("working");
    expect(task.ttlMs).toBeNull();
    expect(task.pollIntervalMs).toBeGreaterThan(0);
    expect(decodeTaskId(task.taskId)).toEqual({
      kind: "test-run",
      runId: "run_1",
    });
  });

  it("puts nothing but the kind and the run id in the task id", async () => {
    const { taskId } = await startTask();
    const decoded = Buffer.from(taskId, "base64url").toString();

    expect(decoded).toBe("ft1:test-run:run_1");
    expect(decoded).not.toContain(HTTP_TOKEN);
    expect(decoded).not.toContain("http");
  });

  it("serves tasks/get from an instance that did not start the task", async () => {
    const { taskId, runId } = await startTask();

    const working = await rpc(instanceB, "tasks/get", { taskId });
    expect(GetTaskResultV2Schema.parse(working.result)).toMatchObject({
      taskId,
      status: "working",
      resultType: "complete",
    });

    setRun(runId, { run_id: runId, state: "done", rows: 42 });
    const done = await rpc(instanceB, "tasks/get", { taskId });
    expect(GetTaskResultV2Schema.parse(done.result)).toMatchObject({
      taskId,
      status: "completed",
      result: { structuredContent: { run_id: runId, state: "done", rows: 42 } },
    });
  });

  it("calls the API with the caller's own token", async () => {
    const { taskId, runId } = await startTask();
    await rpc(instanceB, "tasks/get", { taskId });

    const statusCall = edge.requests.findLast((request) =>
      request.path.endsWith(`/runs/${runId}`)
    );
    expect(statusCall?.authorization).toBe(`Bearer ${HTTP_TOKEN}`);
  });

  it("reports a failed run as a completed task holding a tool error", async () => {
    const { taskId, runId } = await startTask();
    setRun(runId, { state: "error", error: { message: "bad file" } });

    const { result } = await rpc(instanceB, "tasks/get", { taskId });
    expect(GetTaskResultV2Schema.parse(result)).toMatchObject({
      status: "completed",
      statusMessage: "bad file",
      result: { isError: true },
    });
  });

  it("reports a cancelled run", async () => {
    const { taskId, runId } = await startTask();
    setRun(runId, { state: "stopped" });

    const { result } = await rpc(instanceB, "tasks/get", { taskId });
    expect(GetTaskResultV2Schema.parse(result).status).toBe("cancelled");
  });

  describe("task ids that must not resolve", () => {
    it.each([
      ["a forged kind", () => encodeTaskId({ kind: "forged", runId: "run_1" })],
      [
        "a run that does not exist",
        () => encodeTaskId({ kind: "test-run", runId: "run_999" }),
      ],
      ["text that is not a task id", () => "not-a-task-id"],
      ["a raw run id", () => "run_1"],
    ])("rejects %s as not found", async (_label, makeId) => {
      await startTask();
      const taskId = makeId();
      for (const method of ["tasks/get", "tasks/cancel", "tasks/update"]) {
        const { error, result } = await rpc(instanceB, method, {
          taskId,
          ...(method === "tasks/update" ? { inputResponses: {} } : {}),
        });
        // A run that does not exist is only discovered by asking the API,
        // which cancel and update never do for a kind without those
        // operations; they refuse it as unsupported instead.
        if (
          method !== "tasks/get" &&
          decodeTaskId(taskId)?.kind === "test-run"
        ) {
          expect(error?.code).toBe(METHOD_NOT_FOUND);
          continue;
        }
        expect(result).toBeUndefined();
        expect(error).toMatchObject({
          code: INVALID_PARAMS,
          message: expect.stringContaining(TASK_NOT_FOUND),
        });
      }
    });

    it("answers a forged kind without calling the API", async () => {
      const before = edge.requests.length;
      await rpc(instanceB, "tasks/get", {
        taskId: encodeTaskId({ kind: "forged", runId: "run_1" }),
      });
      expect(edge.requests).toHaveLength(before);
    });

    it("hides another tenant's run: the API's 404 surfaces as not found", async () => {
      const { taskId, runId } = await startTask();

      const { error, result } = await rpc(
        instanceB,
        "tasks/get",
        { taskId },
        { token: OTHER_TENANT_TOKEN }
      );
      expect(result).toBeUndefined();
      expect(error).toMatchObject({
        code: INVALID_PARAMS,
        message: expect.stringContaining(TASK_NOT_FOUND),
      });

      // The API was asked, with the other tenant's token, and said no.
      const statusCall = edge.requests.findLast((request) =>
        request.path.endsWith(`/runs/${runId}`)
      );
      expect(statusCall?.authorization).toBe(`Bearer ${OTHER_TENANT_TOKEN}`);
    });
  });

  it.each(["tasks/cancel", "tasks/update"])(
    "refuses %s as not supported",
    async (method) => {
      const { taskId } = await startTask();
      const { error, result } = await rpc(instanceB, method, {
        taskId,
        ...(method === "tasks/update" ? { inputResponses: {} } : {}),
      });

      expect(result).toBeUndefined();
      expect(error).toMatchObject({
        code: METHOD_NOT_FOUND,
        data: { reason: "not_supported", method, kind: "test-run" },
      });
    }
  );

  describe("clients that cannot track a task", () => {
    it("gives a 2026-07-28 client without the extension the API response", async () => {
      const { result } = await startIngest(instanceA, { capabilities: {} });

      expect(result?.resultType).toBe("complete");
      expect(result).not.toHaveProperty("taskId");
      expect(result?.structuredContent).toEqual({
        run_id: "run_1",
        state: "queued",
      });
    });

    it("gives a 2025-era client the API response", async () => {
      const harness = await connectHttp(instanceA.url, "legacy");
      try {
        const result = await harness.client.callTool({
          name: "data_ingest_dataset",
          arguments: { request: { name: "orders" } },
        });
        expect(result.isError).toBeFalsy();
        expect(JSON.parse(textOf(result))).toEqual({
          run_id: "run_1",
          state: "queued",
        });
      } finally {
        await harness.close();
      }
    });
  });
});

describe("a server with no run kinds", () => {
  let edge: MockEdge;
  let server: HttpServerUnderTest;

  beforeAll(async () => {
    edge = await startMockEdge();
    server = await startHttpServer(edge, {}, {}, []);
  });

  afterAll(async () => {
    await server?.stop();
    await edge?.close();
  });

  it("does not advertise the extension", async () => {
    const { result } = await rpc(server, "server/discover", {});
    const capabilities = result?.capabilities as { extensions?: object };
    expect(capabilities.extensions ?? {}).not.toHaveProperty(
      TASKS_EXTENSION_ID_V2
    );
  });

  it("never answers with a task, and has no tasks/get", async () => {
    const started = await startIngest(server);
    expect(started.result?.resultType).toBe("complete");

    const { error } = await rpc(server, "tasks/get", {
      taskId: encodeTaskId({ kind: "test-run", runId: "run_1" }),
    });
    expect(error?.code).toBe(METHOD_NOT_FOUND);
  });
});
