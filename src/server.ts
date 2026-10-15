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

/**
 * CLI main entry point.
 */

import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "@/config/index.js";
import { FrontalMcpServer } from "@/mcp/index.js";
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

const SHUTDOWN_GRACE_MS = 10_000;

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

export async function main(): Promise<void> {
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
      const { HttpTransport } = await import("@/middlewares/http-transport.js");
      const { createRateLimiter } = await import("@/middlewares/rate-limit.js");
      const httpTransport = new HttpTransport(
        () => server.createServer(),
        logger,
        {
          allowedOrigins: config.transport.http?.allowedOrigins,
          maxRequestBodyBytes: config.transport.http?.maxRequestBodyBytes,
          maxSessions: config.transport.http?.maxSessions,
          allowedHosts: config.transport.http?.allowedHosts,
          rateLimiter: createRateLimiter(config.rateLimit, logger),
        }
      );
      await httpTransport.start(
        config.transport.http?.port || 3000,
        config.transport.http?.host || "localhost"
      );
      installSignalHandlers(logger, async () => {
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
