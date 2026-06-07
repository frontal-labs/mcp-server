#!/usr/bin/env node

import { execSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for better output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description) {
  try {
    log(description, "blue");
    execSync(command, { stdio: "inherit", cwd: join(__dirname, "..") });
  } catch (_error) {
    log(`Error during: ${description}`, "red");
    log(`Command: ${command}`, "red");
    process.exit(1);
  }
}

// Build script for Frontal MCP Server
log("Building Frontal MCP Server...", "cyan");

// Clean previous build
runCommand("bun run clean", "Cleaning previous build...");

// Type check
runCommand("bun run type-check", "Running type check...");

// Run tests
runCommand("bun run test", "Running tests...");

// Build the project
runCommand("bun run build", "Building project...");

// Make the CLI executable
const cliPath = join(__dirname, "..", "dist", "bin", "frontal-mcp-server.js");
if (existsSync(cliPath)) {
  try {
    log("Making CLI executable...", "blue");
    chmodSync(cliPath, "755");
  } catch (_error) {
    log("Warning: Could not make CLI executable", "yellow");
  }
} else {
  log("Warning: CLI file not found after build", "yellow");
}

log("Build completed successfully!", "green");
log("Built files are in ./dist/", "cyan");
log("Run with: ./dist/bin/frontal-mcp-server.js", "cyan");
