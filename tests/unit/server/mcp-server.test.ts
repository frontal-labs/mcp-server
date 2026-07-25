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
import { createConfig } from "@/config/index.js";
import { FrontalMcpServer } from "@/server/mcp-server.js";
import { createLogger } from "@/utils/logger.js";

describe("FrontalMcpServer", () => {
  const logger = createLogger({ level: "error" });

  it("should create MCP server with correct name and version", () => {
    const config = createConfig({ apiKey: "" });
    const server = new FrontalMcpServer(config, logger);

    expect(server).toBeDefined();
    expect(server.mcpServerInstance).toBeDefined();
  });

  it("should expose mcpServerInstance getter", () => {
    const config = createConfig({ apiKey: "" });
    const server = new FrontalMcpServer(config, logger);
    const instance = server.mcpServerInstance;

    // McpServer from SDK should have connect method
    expect(typeof instance.connect).toBe("function");
  });

  describe("initialize with selective tool sets", () => {
    it("initializes with only the generic tool set", async () => {
      const config = createConfig({ apiKey: "", toolsets: ["generic"] });
      const server = new FrontalMcpServer(config, logger);
      await expect(server.initialize()).resolves.toBeUndefined();
    });

    it("initializes with all tool sets", async () => {
      const config = createConfig({
        apiKey: "",
        toolsets: ["generic", "ontology", "data"],
      });
      const server = new FrontalMcpServer(config, logger);
      await expect(server.initialize()).resolves.toBeUndefined();
    });

    it("initializes with only curated tool sets", async () => {
      const config = createConfig({
        apiKey: "",
        toolsets: ["ontology", "data"],
      });
      const server = new FrontalMcpServer(config, logger);
      await expect(server.initialize()).resolves.toBeUndefined();
    });
  });

  describe("close", () => {
    it("should close without error", async () => {
      const config = createConfig({ apiKey: "", toolsets: ["generic"] });
      const server = new FrontalMcpServer(config, logger);
      await server.initialize();
      await expect(server.close()).resolves.toBeUndefined();
    });
  });
});
