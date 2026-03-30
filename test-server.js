#!/usr/bin/env node

// Simple test script to verify the MCP server works
import { createLogger, FrontalMcpServer } from "./dist/index.js";

async function test() {
  console.log("Testing Frontal MCP Server...");

  const config = {
    apiKey: "test-key",
    baseUrl: "https://api.frontal.dev/v1",
    transport: {
      transport: "stdio" as const,
    },
    auth: {
      type: "api-key" as const,
      apiKey: "test-key",
    },
    services: {
      ai: true,
      blob: true,
      functions: true,
      graph: true,
      pipelines: true,
    },
    logLevel: "info" as const,
    verbose: false,
  };

  const logger = createLogger({ level: "info" });
  const server = new FrontalMcpServer(config, logger);

  try {
    await server.initialize();
    console.log("✅ Server initialized successfully");

    // Test stdio connection (this will hang waiting for input)
    console.log("🚀 Starting stdio transport...");
    await server.connectStdio();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

test();
