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
import { beforeEach, describe, expect, it } from "vitest";
import { createConfig } from "@/config/index.js";
import type { ServerConfig } from "@/config/server-config.js";
import { FrontalMcpServer } from "@/server/mcp-server.js";
import { createLogger } from "@/utils/logger.js";

describe("FrontalMcpServer", () => {
  let server: FrontalMcpServer;
  let config: ServerConfig;

  beforeEach(() => {
    config = createConfig({
      apiKey: "test-key",
      baseUrl: "https://api.frontal.dev/v1",
    });

    const logger = createLogger({ level: "error" });
    server = new FrontalMcpServer(config, logger);
  });

  it("should initialize successfully", async () => {
    await expect(server.initialize()).resolves.not.toThrow();
  });

  it("should have correct configuration", () => {
    expect(server).toBeDefined();
  });

  it("should expose mcpServerInstance", async () => {
    await server.initialize();
    expect(server.mcpServerInstance).toBeDefined();
  });

  it("should close gracefully", async () => {
    await server.initialize();
    await expect(server.close()).resolves.not.toThrow();
  });
});
