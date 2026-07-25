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
import { createConfig, env, loadConfig } from "@/config/index.js";

describe("env", () => {
  it("should have validated FRONTAL_API_KEY with default", () => {
    expect(typeof env.FRONTAL_API_KEY).toBe("string");
  });

  it("should have validated FRONTAL_BASE_URL with default", () => {
    expect(env.FRONTAL_BASE_URL).toBe("https://api.frontal.dev");
  });

  it("should have validated MCP_LOG_LEVEL with default", () => {
    expect(env.MCP_LOG_LEVEL).toBe("info");
  });
});

describe("createConfig", () => {
  it("should create default configuration with all fields", () => {
    delete process.env.FRONTAL_API_KEY;
    delete process.env.FRONTAL_BASE_URL;
    const config = createConfig();

    expect(config.apiKey).toBe("");
    expect(config.baseUrl).toBe("https://api.frontal.dev");
    expect(config.transport.transport).toBe("stdio");
    expect(config.auth.type).toBe("api-key");
    expect(config.logLevel).toBe("info");
    expect(config.verbose).toBe(false);
  });

  it("should override apiKey", () => {
    const config = createConfig({ apiKey: "my-key" });
    expect(config.apiKey).toBe("my-key");
  });

  it("should override baseUrl", () => {
    const config = createConfig({ baseUrl: "https://custom.api.dev/v2" });
    expect(config.baseUrl).toBe("https://custom.api.dev/v2");
  });

  it("should override logLevel", () => {
    const config = createConfig({ logLevel: "debug" });
    expect(config.logLevel).toBe("debug");
  });

  it("should override verbose", () => {
    const config = createConfig({ verbose: true });
    expect(config.verbose).toBe(true);
  });

  it("should override transport to http", () => {
    const config = createConfig({
      transport: { transport: "http", http: { port: 8080, host: "0.0.0.0" } },
    });
    expect(config.transport.transport).toBe("http");
    expect(config.transport.http?.port).toBe(8080);
    expect(config.transport.http?.host).toBe("0.0.0.0");
  });

  it("should use env defaults for apiKey when no override given", () => {
    const config = createConfig();
    // env.FRONTAL_API_KEY defaults to "" when not set
    expect(typeof config.apiKey).toBe("string");
  });

  it("should use env defaults for baseUrl when no override given", () => {
    const config = createConfig();
    // env.FRONTAL_BASE_URL defaults to the bare Frontal API host
    expect(config.baseUrl).toBe("https://api.frontal.dev");
  });

  it("should allow empty string apiKey", () => {
    const config = createConfig({ apiKey: "" });
    expect(config.apiKey).toBe("");
  });

  it("should throw on invalid transport value", () => {
    expect(() =>
      createConfig({ transport: { transport: "websocket" } })
    ).toThrow();
  });

  it("should throw on invalid logLevel", () => {
    expect(() => createConfig({ logLevel: "verbose" })).toThrow();
  });
});

describe("loadConfig", () => {
  it("should return valid config with empty options", async () => {
    const config = await loadConfig({});

    expect(config.apiKey).toBe("");
    expect(config.baseUrl).toBe("https://api.frontal.dev");
    expect(config.transport.transport).toBe("stdio");
    expect(config.logLevel).toBe("info");
  });

  it("should use apiKey from options", async () => {
    const config = await loadConfig({ apiKey: "opts-key" });
    expect(config.apiKey).toBe("opts-key");
  });

  it("should fall back to env-validated FRONTAL_API_KEY", async () => {
    // env is cached at module load, so we test that loadConfig uses the env default
    const config = await loadConfig({});
    expect(typeof config.apiKey).toBe("string");
  });

  it("should prefer options apiKey over env default", async () => {
    const config = await loadConfig({ apiKey: "opts-key" });
    expect(config.apiKey).toBe("opts-key");
  });

  it("should set transport to http with port", async () => {
    const config = await loadConfig({ transport: "http", port: 4000 });
    expect(config.transport.transport).toBe("http");
    expect(config.transport.http?.port).toBe(4000);
  });

  it("should set custom host", async () => {
    const config = await loadConfig({
      transport: "http",
      port: 3000,
      host: "0.0.0.0",
    });
    expect(config.transport.http?.host).toBe("0.0.0.0");
  });

  it("should use logLevel from options", async () => {
    const config = await loadConfig({ logLevel: "debug" });
    expect(config.logLevel).toBe("debug");
  });

  it("should use verbose from options", async () => {
    const config = await loadConfig({ verbose: true });
    expect(config.verbose).toBe(true);
  });

  it("should throw on invalid config file path", async () => {
    await expect(
      loadConfig({ configPath: "/nonexistent/config.json" })
    ).rejects.toThrow("Failed to load config file");
  });
});
