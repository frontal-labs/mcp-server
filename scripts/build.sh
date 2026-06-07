#!/bin/bash

# Build script for Frontal MCP Server
set -e

echo "Building Frontal MCP Server..."

# Clean previous build
echo "Cleaning previous build..."
bun run clean

# Type check
echo "Running type check..."
bun run type-check

# Run tests
echo "Running tests..."
bun run test

# Build the project
echo "Building project..."
bun run build

# Make the CLI executable
echo "Making CLI executable..."
chmod +x dist/bin/frontal-mcp-server.js

echo "Build completed successfully!"
echo "Built files are in ./dist/"
echo "Run with: ./dist/bin/frontal-mcp-server.js"
