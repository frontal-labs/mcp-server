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
import {
  ConfigError,
  ERROR_CODE,
  FrontalApiError,
  FrontalError,
  isFrontalApiError,
  isFrontalError,
  isRetryableError,
  parseErrorEnvelope,
  RETRYABLE_STATUS,
  SpecError,
  ToolInputError,
} from "@/lib/error.js";

describe("error hierarchy", () => {
  it("FrontalApiError carries HTTP metadata and is a FrontalError", () => {
    const err = new FrontalApiError("boom", 503, ERROR_CODE.UPSTREAM, true, {
      x: 1,
    });
    expect(err).toBeInstanceOf(FrontalError);
    expect(err.name).toBe("FrontalApiError");
    expect(err.kind).toBe("api");
    expect(err.httpStatus).toBe(503);
    expect(err.retryable).toBe(true);
    expect(err.details).toEqual({ x: 1 });
  });

  it("domain errors set kind and default code", () => {
    expect(new ConfigError("bad").code).toBe(ERROR_CODE.CONFIG_INVALID);
    expect(new SpecError("bad").code).toBe(ERROR_CODE.SPEC_INVALID);
    expect(new ToolInputError("bad").code).toBe(ERROR_CODE.INVALID_ARGUMENTS);
    expect(new ConfigError("bad").kind).toBe("config");
  });
});

describe("type guards", () => {
  it("isFrontalError / isFrontalApiError discriminate correctly", () => {
    expect(isFrontalError(new SpecError("x"))).toBe(true);
    expect(isFrontalError(new Error("x"))).toBe(false);
    expect(isFrontalApiError(new FrontalApiError("x", 400))).toBe(true);
    expect(isFrontalApiError(new SpecError("x"))).toBe(false);
  });

  it("isRetryableError honors API verdict and transport codes", () => {
    expect(isRetryableError(new FrontalApiError("x", 503, "u", true))).toBe(
      true
    );
    expect(isRetryableError(new FrontalApiError("x", 400, "u", false))).toBe(
      false
    );
    const netErr = Object.assign(new Error("reset"), { code: "ECONNRESET" });
    expect(isRetryableError(netErr)).toBe(true);
    expect(isRetryableError("nope")).toBe(false);
  });

  it("RETRYABLE_STATUS matches the edge retry matrix", () => {
    for (const s of [429, 502, 503, 504]) {
      expect(RETRYABLE_STATUS.has(s)).toBe(true);
    }
    for (const s of [400, 401, 409, 501]) {
      expect(RETRYABLE_STATUS.has(s)).toBe(false);
    }
  });
});

describe("parseErrorEnvelope", () => {
  it("parses the gateway shape", () => {
    expect(
      parseErrorEnvelope({ error: { code: "bad", message: "gw" } }, "fb")
    ).toEqual({ code: "bad", message: "gw" });
  });

  it("parses the geo-router shape", () => {
    expect(parseErrorEnvelope({ error: "rl", message: "slow" }, "fb")).toEqual({
      code: "rl",
      message: "slow",
    });
  });

  it("parses the backend google.rpc.Status shape", () => {
    expect(
      parseErrorEnvelope({ code: "X", message: "m", details: [1] }, "fb")
    ).toEqual({ code: "X", message: "m", details: [1] });
  });

  it("parses the identity/IAM shape", () => {
    expect(
      parseErrorEnvelope(
        { code: 400, msg: "bad request", error_code: "validation_failed" },
        "fb"
      )
    ).toEqual({ code: "validation_failed", message: "bad request" });
  });

  it("uses the numeric code and error_description for identity errors", () => {
    expect(
      parseErrorEnvelope(
        { code: 401, error_description: "token expired" },
        "fb"
      )
    ).toEqual({ code: "401", message: "token expired" });
  });

  it("falls back for unrecognized bodies", () => {
    expect(parseErrorEnvelope(null, "fb")).toEqual({ message: "fb" });
    expect(parseErrorEnvelope(42, "fb")).toEqual({ message: "fb" });
  });
});
