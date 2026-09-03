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

import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "@/lib/server-config.js";
import { FrontalMcpServer } from "@/server/mcp-server.js";
import { createLogger } from "@/utils/logger.js";
import { VERSION } from "@/version.js";

const program = new Command();

program
  .name("frontal-mcp-server")
  .description("Model Context Protocol server for Frontal services")
  .version(VERSION)
  .option("-t, --transport <type>", "Transport type (stdio|http)", "stdio")
  .option("-p, --port <number>", "HTTP port (for http transport)", "3000")
  .option("--host <address>", "HTTP host (for http transport)", "localhost")
  .option("-k, --api-key <key>", "Frontal API key")
  .option("-c, --config <path>", "Configuration file path")
  .option("-v, --verbose", "Verbose logging")
  .option("--log-level <level>", "Log level (error|warn|info|debug)", "info");

program.parse();

/** Give in-flight work this long to finish before exiting anyway. */
const SHUTDOWN_GRACE_MS = 10_000;

/**
 * Close the server on SIGTERM/SIGINT.
 *
 * Rolling deploys send SIGTERM. Without a handler Node exits immediately and
 * drops in-flight requests and open SSE streams instead of letting them
 * finish.
 */
function installSignalHandlers(
  logger: ReturnType<typeof createLogger>,
  stop: () => Promise<void>
): void {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down...`);

    // Never let a stuck connection block the exit indefinitely.
    const timer = setTimeout(() => {
      logger.warn(
        `Shutdown still pending after ${SHUTDOWN_GRACE_MS}ms, exiting anyway`
      );
      process.exit(0);
    }, SHUTDOWN_GRACE_MS);
    timer.unref?.();

    try {
      await stop();
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (error) {
      logger.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => void shutdown(signal));
  }
}

async function main() {
  const options = program.opts();
  const logger = createLogger({ level: options.logLevel });
  const spinner = ora("Initializing Frontal MCP Server...").start();

  try {
    const config = await loadConfig({
      transport: options.transport,
      port: options.port ? Number(options.port) : undefined,
      host: options.host,
      apiKey: options.apiKey,
      configPath: options.config,
      verbose: options.verbose,
      logLevel: options.logLevel,
    });

    const server = new FrontalMcpServer(config, logger);
    await server.initialize();

    if (config.transport.transport === "stdio") {
      await server.connectStdio();
      installSignalHandlers(logger, () => server.close());
    } else if (config.transport.transport === "http") {
      const { EnhancedHttpTransport } = await import(
        "@/server/enhanced-http-transport.js"
      );
      const httpTransport = new EnhancedHttpTransport(
        // Each MCP session gets its own server instance: an McpServer binds to
        // a single transport, so sharing one across sessions would let only
        // the first client connect.
        () => server.createServer(),
        logger,
        {
          allowedOrigins: config.transport.http?.allowedOrigins,
          maxRequestBodyBytes: config.transport.http?.maxRequestBodyBytes,
          maxSessions: config.transport.http?.maxSessions,
          allowedHosts: config.transport.http?.allowedHosts,
        }
      );
      await httpTransport.start(
        config.transport.http?.port || 3000,
        config.transport.http?.host || "localhost"
      );
      installSignalHandlers(logger, async () => {
        // Stop the listener and close live sessions first, then the server
        // that backs them.
        await httpTransport.stop();
        await server.close();
      });
    } else {
      throw new Error(`Unsupported transport: ${config.transport.transport}`);
    }

    spinner.succeed(chalk.green("Frontal MCP Server started successfully"));
  } catch (error) {
    spinner.fail(chalk.red("Failed to start server"));
    logger.error("Server startup failed:", error);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(chalk.red("Fatal error:"), message);
  process.exit(1);
});
