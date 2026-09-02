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

  it("keeps tokens isolated across interleaved concurrent scopes", async () => {
    // The HTTP transport is multi-tenant: many callers' requests are in flight
    // at once, each carrying its own key. A token that leaked between them
    // would send one tenant's request with another tenant's credentials.
    const tenants = Array.from({ length: 25 }, (_, i) => `frt_tenant_${i}`);

    const observed = await Promise.all(
      tenants.map((token, i) =>
        runWithToken(token, async () => {
          // Yield repeatedly so the scopes genuinely interleave rather than
          // running to completion one after another.
          await new Promise((resolve) => setTimeout(resolve, (i % 5) + 1));
          const midpoint = getRequestToken();
          await new Promise((resolve) => setTimeout(resolve, 5 - (i % 5)));
          return { midpoint, end: getRequestToken() };
        })
      )
    );

    for (const [i, seen] of observed.entries()) {
      expect(seen.midpoint).toBe(tenants[i]);
      expect(seen.end).toBe(tenants[i]);
    }
    expect(getRequestToken()).toBeUndefined();
  });
});
