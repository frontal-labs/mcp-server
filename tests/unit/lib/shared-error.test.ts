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
 * The server's errors are built on the shared `@frontal-labs/error` class.
 */
import {
  isFrontalError as isSharedFrontalError,
  FrontalError as SharedFrontalError,
} from "@frontal-labs/error";
import { describe, expect, it } from "vitest";
import { toToolError } from "@/tools/tool-helpers.js";
import {
  ConfigError,
  ERROR_CODE,
  ERROR_SCOPE,
  FrontalApiError,
  hintForStatus,
  SpecError,
  ToolInputError,
} from "@/types/errors.js";

const HINTS: [number, string][] = [
  [401, "Check your API key or authentication configuration."],
  [409, "The region may be invalid or already in use."],
  [501, "This feature is not currently enabled."],
];

describe("errors on @frontal-labs/error", () => {
  it("every error class is a shared FrontalError with the server's scope", () => {
    const errors = [
      new FrontalApiError("boom", 500, "upstream"),
      new ConfigError("bad config"),
      new SpecError("bad spec"),
      new ToolInputError("bad input"),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(SharedFrontalError);
      expect(error).toBeInstanceOf(Error);
      expect(isSharedFrontalError(error)).toBe(true);
      expect(error.scope).toBe(ERROR_SCOPE);
      expect(error.name).toBe(error.constructor.name);
      expect(error.code).toBeTruthy();
    }
  });

  it("keeps the fields the server already exposed", () => {
    const error = new FrontalApiError(
      "Not found",
      404,
      ERROR_CODE.NOT_FOUND,
      false,
      { field: "id" },
      "req_1"
    );

    expect(error.message).toBe("Not found");
    expect(error.httpStatus).toBe(404);
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("not_found");
    expect(error.retryable).toBe(false);
    expect(error.details).toEqual({ field: "id" });
    expect(error.requestId).toBe("req_1");
    expect(error.context).toEqual({ requestId: "req_1" });
    expect(error.kind).toBe("api");
  });

  it.each(HINTS)("attaches the %i hint to an API error", (status, hint) => {
    expect(hintForStatus(status)).toBe(hint);
    expect(new FrontalApiError("x", status).hint).toBe(hint);
  });

  it("attaches no hint to other statuses", () => {
    for (const status of [400, 403, 404, 429, 500, 503]) {
      expect(new FrontalApiError("x", status).hint).toBeUndefined();
    }
  });

  it("accepts a status outside the HTTP error range, such as a network failure", () => {
    const error = new FrontalApiError("socket hang up", 0, "network_error");

    expect(error.httpStatus).toBe(0);
    expect(error.statusCode).toBeUndefined();
  });

  it("falls back to the unknown code when the API sends a blank one", () => {
    expect(new FrontalApiError("x", 400, "").code).toBe(ERROR_CODE.UNKNOWN);
    expect(new FrontalApiError("x", 400, "  ").code).toBe(ERROR_CODE.UNKNOWN);
  });
});

describe("toToolError", () => {
  it.each(HINTS)("renders the %i hint exactly as before", (status, hint) => {
    const result = toToolError(new FrontalApiError("Request failed", status));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(`Request failed\nHint: ${hint}`);
  });

  it("renders the API's details after the hint", () => {
    const result = toToolError(
      new FrontalApiError("Conflict", 409, "invalid_region", false, {
        region: "zzz",
      })
    );

    expect(result.content[0].text).toBe(
      'Conflict\nHint: The region may be invalid or already in use.\nDetails: {"region":"zzz"}'
    );
  });

  it("renders only the message for errors without a hint", () => {
    expect(toToolError(new ToolInputError("bad")).content[0].text).toBe("bad");
    expect(toToolError(new Error("plain")).content[0].text).toBe("plain");
    expect(toToolError("a string").content[0].text).toBe("a string");
  });

  it("does not leak the stack, scope or request id into the tool text", () => {
    const text = toToolError(
      new FrontalApiError(
        "Nope",
        401,
        "unauthorized",
        false,
        undefined,
        "req_9"
      )
    ).content[0].text;

    expect(text).not.toContain("req_9");
    expect(text).not.toContain(ERROR_SCOPE);
    expect(text).not.toContain("at ");
  });
});
