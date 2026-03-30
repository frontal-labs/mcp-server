#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
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

// Test script for Frontal MCP Server
log("Running Frontal MCP Server Tests...", "cyan");

// Run unit tests
runCommand("bun run test", "Running unit tests...");

// Run tests with coverage
runCommand("bun run test:coverage", "Running tests with coverage...");

// Check code quality
runCommand("bun run lint", "Running linting...");

// Type check
runCommand("bun run type-check", "Running type check...");

log("All tests passed!", "green");

// Check if coverage directory exists
const coveragePath = join(__dirname, "..", "coverage");
if (existsSync(coveragePath)) {
  log("Coverage report available in ./coverage/", "cyan");
} else {
  log("Coverage report will be generated in ./coverage/", "cyan");
}
