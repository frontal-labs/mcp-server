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
import { afterEach, describe, expect, it, vi } from "vitest";

/** Load the config module fresh, with `FRONTAL_READ_ONLY` set as given. */
async function loadWith(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) {
    delete process.env.FRONTAL_READ_ONLY;
  } else {
    process.env.FRONTAL_READ_ONLY = value;
  }
  return await import("@/config/index.js");
}

describe("FRONTAL_READ_ONLY", () => {
  afterEach(() => {
    delete process.env.FRONTAL_READ_ONLY;
    vi.resetModules();
  });

  it("defaults to false", async () => {
    const { createConfig, loadConfig } = await loadWith(undefined);

    expect(createConfig().readOnly).toBe(false);
    expect((await loadConfig({})).readOnly).toBe(false);
  });

  it.each(["true", "1", "yes", "on", "TRUE"])(
    "reads %s as true",
    async (value) => {
      const { createConfig, loadConfig } = await loadWith(value);

      expect(createConfig().readOnly).toBe(true);
      expect((await loadConfig({})).readOnly).toBe(true);
    }
  );

  it.each(["false", "0", "no", "off"])("reads %s as false", async (value) => {
    const { createConfig } = await loadWith(value);

    expect(createConfig().readOnly).toBe(false);
  });

  it("rejects a value that is not a boolean", async () => {
    await expect(loadWith("maybe")).rejects.toThrow();
  });

  it("can be overridden in code", async () => {
    const { createConfig } = await loadWith(undefined);

    expect(createConfig({ readOnly: true }).readOnly).toBe(true);
  });

  it("enables the new tool sets by default", async () => {
    const { createConfig } = await loadWith(undefined);

    expect(createConfig().toolsets).toEqual([
      "generic",
      "ontology",
      "data",
      "workflows",
      "integrations",
      "events",
    ]);
  });
});
