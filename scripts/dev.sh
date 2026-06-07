#!/bin/bash

# Development script for Frontal MCP Server
set -e

echo "Starting Frontal MCP Server in development mode..."

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo ".env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "Please edit .env file with your API key and configuration."
fi

# Start development server
echo "Starting development server..."
bun run dev
