import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
    {
        name: "mcp-server",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "ping",
                description: "A simple ping tool to verify the server is running",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "ping") {
        return {
            content: [
                {
                    type: "text",
                    text: "pong",
                },
            ],
        };
    }
    throw new Error("Tool not found");
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP server running on stdio");
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
