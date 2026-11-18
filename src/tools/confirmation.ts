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
 * Confirmation before a write.
 *
 * Every operation that is not on the read allow-list is confirmed with the
 * user before it runs, when the client can be asked. A client that cannot
 * be asked runs the tool directly; every such tool is annotated
 * `destructiveHint: true`, so the client shows its own approval prompt.
 *
 * This is a courtesy to the user, not an access control: the answer comes
 * back from the client, and a client that wants to skip the question can.
 * The API's own authorization is what actually protects the data.
 */
import {
  CLIENT_CAPABILITIES_META_KEY,
  type ClientCapabilities,
  inputRequired,
  inputResponse,
  type McpServer,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";

/** Key of the confirmation request in `inputRequests` / `inputResponses`. */
const CONFIRM_KEY = "confirm";

const confirmationSchema = z.object({
  confirm: z.boolean().describe("Run this operation?"),
});

/**
 * Whether the client can answer an elicitation for this request.
 *
 * On 2026-07-28 the capabilities travel with every request. On a 2025-era
 * connection they come from the `initialize` handshake, which only a
 * connection-pinned instance (stdio) has seen; a stateless legacy HTTP
 * request has none, and the tool then runs without asking.
 */
export function clientSupportsElicitation(
  server: McpServer,
  toolCtx: ServerContext
): boolean {
  const envelope = toolCtx.mcpReq.envelope as
    | Record<string, unknown>
    | undefined;
  const capabilities =
    (envelope?.[CLIENT_CAPABILITIES_META_KEY] as
      | ClientCapabilities
      | undefined) ?? server.server.getClientCapabilities();
  return capabilities?.elicitation !== undefined;
}

export type ConfirmationOutcome =
  /** Go ahead: the user said yes, or the client cannot be asked. */
  | { status: "proceed" }
  /** The user said no, declined or cancelled. */
  | { status: "declined" }
  /** Return `request` from the tool handler; the client retries with the answer. */
  | { status: "ask"; request: ReturnType<typeof inputRequired> };

/** One round of the confirmation exchange for a write. */
export function confirmWrite(
  server: McpServer,
  toolCtx: ServerContext,
  question: string
): ConfirmationOutcome {
  if (!clientSupportsElicitation(server, toolCtx)) {
    return { status: "proceed" };
  }
  const answer = inputResponse(toolCtx.mcpReq.inputResponses, CONFIRM_KEY);
  if (answer.kind !== "elicit") {
    return {
      status: "ask",
      request: inputRequired({
        inputRequests: {
          [CONFIRM_KEY]: inputRequired.elicit({
            message: question,
            requestedSchema: confirmationSchema,
          }),
        },
      }),
    };
  }
  const confirmed =
    answer.action === "accept" && answer.content?.confirm === true;
  return { status: confirmed ? "proceed" : "declined" };
}

/** The error a tool returns when the user did not confirm. */
export function notConfirmed(what: string): Error {
  return new Error(
    `${what} was not run: the user did not confirm the operation.`
  );
}
