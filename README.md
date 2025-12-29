<picture>
    <source srcset="./assets/banner-dark.png" media="(prefers-color-scheme: dark)">
    <source srcset="./assets/banner-dark.png" media="(prefers-color-scheme: light)">
    <img src="./assets/banner-dark.png" alt="Frontal Banner">
</picture>

# MCP Server

A Model Context Protocol (MCP) server implemented with Bun and TypeScript.

<p>
    <a href="https://join.slack.com/t/frontal-community/shared_invite/zt-37vzd191x-KlvQUjTQh6nEpYMAJhAN8g">Slack</a>
    ·
    <a href="https://frontal.dev">Website</a>
    ·
    <a href="https://github.com/frontal-labs/mcp-server/issues">Issues</a>
</p>

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
