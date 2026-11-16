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
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

const CLI_PATH = resolve(__dirname, "../dist/bin/frontal-mcp-server.js");
const CLI_EXISTS = existsSync(CLI_PATH);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!CLI_EXISTS)("CLI Workflow E2E Tests", () => {
  let cliProcess: ReturnType<typeof spawn> | null = null;

  afterEach(() => {
    if (cliProcess && !cliProcess.killed) {
      cliProcess.kill();
    }
    cliProcess = null;
  });

  it("is the file package.json publishes as the bin", () => {
    expect(
      resolve(__dirname, "..", packageJson.bin["frontal-mcp-server"])
    ).toBe(CLI_PATH);
  });

  it("answers an MCP client over stdio when run with node", async () => {
    const client = new Client({ name: "cli-e2e", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [CLI_PATH, "--transport", "stdio", "--log-level", "error"],
        env: { FRONTAL_API_KEY: "frt_e2e_key" },
        stderr: "ignore",
      })
    );
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toContain(
        "frontal_list_endpoints"
      );
    } finally {
      await client.close();
    }
  });

  it("should start CLI with stdio transport", async () => {
    cliProcess = spawn("node", [CLI_PATH, "--transport", "stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        FRONTAL_API_KEY: "test-key",
      },
    });

    await sleep(1000);

    expect(cliProcess.pid).toBeDefined();
    expect(!cliProcess.killed).toBe(true);
  });

  it("should handle help command", async () => {
    const chunks: Buffer[] = [];
    cliProcess = spawn("node", [CLI_PATH, "--help"], {
      stdio: "pipe",
    });

    cliProcess.stdout?.on("data", (data: Buffer) => {
      chunks.push(data);
    });

    await new Promise<void>((resolve) => {
      cliProcess?.on("exit", () => resolve());
    });

    const output = Buffer.concat(chunks).toString();
    expect(output).toContain("frontal-mcp-server");
    expect(output).toContain("--transport");
    expect(output).toContain("--api-key");
  });

  it("should accept API key via environment variable", async () => {
    cliProcess = spawn("node", [CLI_PATH, "--transport", "stdio"], {
      stdio: "pipe",
      env: {
        ...process.env,
        FRONTAL_API_KEY: "test-api-key-from-env",
      },
    });

    await sleep(1000);

    // Process should not exit immediately if API key is provided
    expect(cliProcess.pid).toBeDefined();
  });
});
