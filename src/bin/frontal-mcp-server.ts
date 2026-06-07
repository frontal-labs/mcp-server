#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { loadConfig } from "@/lib/server-config.js";
import { FrontalMcpServer } from "@/server/mcp-server.js";
import { createLogger } from "@/utils/logger.js";

const program = new Command();

program
  .name("frontal-mcp-server")
  .description("Model Context Protocol server for Frontal services")
  .version("1.0.0")
  .option("-t, --transport <type>", "Transport type (stdio|http)", "stdio")
  .option("-p, --port <number>", "HTTP port (for http transport)", "3000")
  .option("--host <address>", "HTTP host (for http transport)", "localhost")
  .option("-k, --api-key <key>", "Frontal API key")
  .option("-c, --config <path>", "Configuration file path")
  .option("-v, --verbose", "Verbose logging")
  .option("--log-level <level>", "Log level (error|warn|info|debug)", "info");

program.parse();

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
    } else if (config.transport.transport === "http") {
      const { EnhancedHttpTransport } = await import(
        "@/server/enhanced-http-transport.js"
      );
      const httpTransport = new EnhancedHttpTransport(
        server.mcpServerInstance,
        logger
      );
      await httpTransport.start(
        config.transport.http?.port || 3000,
        config.transport.http?.host || "localhost"
      );
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
