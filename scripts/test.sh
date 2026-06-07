#!/bin/bash

# Test script for Frontal MCP Server
set -e

echo "Running Frontal MCP Server Tests..."

# Run unit tests
echo "Running unit tests..."
bun run test

# Run tests with coverage
echo "Running tests with coverage..."
bun run test:coverage

# Check code quality
echo "Running linting..."
bun run lint

# Type check
echo "Running type check..."
bun run type-check

echo "All tests passed!"
echo "Coverage report available in ./coverage/"
