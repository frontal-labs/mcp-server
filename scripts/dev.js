#!/usr/bin/env node

import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
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

// Development script for Frontal MCP Server
log("Starting Frontal MCP Server in development mode...", "cyan");

// Check if .env file exists
const envPath = join(__dirname, "..", ".env");
const envExamplePath = join(__dirname, "..", ".env.example");

if (!existsSync(envPath)) {
  if (existsSync(envExamplePath)) {
    log(
      "Warning: .env file not found. Creating from .env.example...",
      "yellow"
    );
    try {
      copyFileSync(envExamplePath, envPath);
      log(
        "Please edit .env file with your API key and configuration.",
        "yellow"
      );
    } catch (_error) {
      log("Error creating .env file from .env.example", "red");
      process.exit(1);
    }
  } else {
    log(
      "Warning: Neither .env nor .env.example found. Please create .env file manually.",
      "yellow"
    );
  }
}

// Start development server
runCommand("bun run dev", "Starting development server...");
