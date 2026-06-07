# Frontal MCP Server - Examples

This directory contains practical examples and integration patterns for using the Frontal MCP Server with various AI assistants and applications.

## Available Examples

### [claude-desktop.json](./claude-desktop.json)
Basic Claude Desktop configuration for stdio transport integration.

### [http-integration/](./http-integration/)
Complete HTTP transport example with Express.js server and web client.

### [ai-assistant/](./ai-assistant/)
Custom AI assistant implementation showing programmatic MCP integration.

### [batch-processing/](./batch-processing/)
Batch processing examples with rate limiting and error handling.

### [monitoring/](./monitoring/)
Performance monitoring and analytics integration examples.

## Quick Start

1. **Choose an example** based on your use case
2. **Copy configuration** files to your environment
3. **Update credentials** with your Frontal API key
4. **Run the example** following the specific instructions

## Integration Patterns

### Claude Desktop
```json
{
  "mcpServers": {
    "frontal": {
      "command": "frontal-mcp-server",
      "args": ["--transport", "stdio"],
      "env": {
        "FRONTAL_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### HTTP Web Server
```typescript
import { FrontalMcpServer } from '@frontal-labs/mcp-server';

const server = new FrontalMcpServer({
  apiKey: process.env.FRONTAL_API_KEY,
  transport: {
    transport: 'http',
    http: { host: 'localhost', port: 3000 }
  }
});

await server.initialize();
await server.connectHttp();
```

### Custom AI Assistant
```typescript
class MyAssistant {
  constructor(private mcpServer: FrontalMcpServer) {}
  
  async processRequest(request: string) {
    return await this.mcpServer.callTool('ai-generate-text', {
      model: 'frontal-gpt-4',
      prompt: request
    });
  }
}
```

## Best Practices

- **Security**: Never hardcode API keys, use environment variables
- **Error Handling**: Implement proper retry logic and error recovery
- **Performance**: Use batching and caching for high-volume operations
- **Monitoring**: Track usage metrics and performance indicators
- **Testing**: Test all integrations with sandbox environments first

## Contributing

Have an example to share? Please:

1. Create a new directory for your example
2. Include a README with setup instructions
3. Add proper error handling and logging
4. Submit a pull request

## Support

- **Documentation**: See [../docs/](../docs/) for detailed guides
- **Issues**: Report problems on GitHub
- **Community**: Join our Discord for discussions
