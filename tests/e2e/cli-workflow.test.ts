import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const CLI_PATH = resolve(__dirname, "../../dist/bin/frontal-mcp-server.js");
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

  it("should start CLI with stdio transport", async () => {
    cliProcess = spawn(
      "node",
      [CLI_PATH, "--transport", "stdio"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          FRONTAL_API_KEY: "test-key",
        },
      }
    );

    await sleep(1000);

    expect(cliProcess.pid).toBeDefined();
    expect(!cliProcess.killed).toBe(true);
  });

  it("should handle help command", async () => {
    cliProcess = spawn("node", [CLI_PATH, "--help"], {
      stdio: "pipe",
    });

    let output = "";
    cliProcess.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    await sleep(1000);

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
