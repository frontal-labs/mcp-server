# MCP Server

A Model Context Protocol (MCP) server implemented with Bun and TypeScript.

## Features

- **Ping Tool**: A simple tool to verify server connectivity.
- **Stdio Transport**: Communicates over standard input/output.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed on your system.

### Installation

```bash
bun install
```

### Running the Server

```bash
bun start
```

For development with hot-reloading:

```bash
bun dev
```

## Usage

This server is designed to be used with an MCP client (like Claude Desktop or any other MCP-compatible host).

### Available Tools

- `ping`: Returns "pong" to verify the server is alive.

## Development

### Linting & Formatting

This project uses [Biome](https://biomejs.dev) for linting and formatting.

```bash
bun lint
bun format
```

### Releases

We use [Changesets](https://github.com/changesets/changesets) for versioning and changelog management.
