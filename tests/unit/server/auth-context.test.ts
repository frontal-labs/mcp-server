import { describe, expect, it } from "vitest";
import { getRequestToken, runWithToken } from "@/server/auth-context.js";

describe("auth-context", () => {
  it("returns undefined outside any request scope", () => {
    expect(getRequestToken()).toBeUndefined();
  });

  it("binds a token within runWithToken", () => {
    runWithToken("frt_abc", () => {
      expect(getRequestToken()).toBe("frt_abc");
    });
  });

  it("does not leak the token outside the scope", () => {
    runWithToken("frt_abc", () => {
      // in scope
      expect(getRequestToken()).toBe("frt_abc");
    });
    expect(getRequestToken()).toBeUndefined();
  });

  it("isolates nested scopes", () => {
    runWithToken("frt_outer", () => {
      runWithToken("frt_inner", () => {
        expect(getRequestToken()).toBe("frt_inner");
      });
      expect(getRequestToken()).toBe("frt_outer");
    });
  });
});
