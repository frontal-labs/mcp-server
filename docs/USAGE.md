# Frontal MCP Server - Usage Guide

## Overview

This guide provides practical examples and use cases for using the Frontal MCP Server with various AI assistants and integration patterns. Learn how to leverage Frontal's cloud services through the Model Context Protocol.

## Quick Start

### Basic Setup

1. **Install the MCP Server**

```bash
npm install -g @frontal-labs/mcp-server
# or
bun add @frontal-labs/mcp-server
```

2. **Configure your API Key**

```bash
export FRONTAL_API_KEY="your_api_key_here"
```

3. **Start the Server**

```bash
frontal-mcp-server --transport stdio
```

## Integration Examples

### Claude Desktop Integration

#### Configuration

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

#### Usage Examples

Once configured, you can use Frontal services directly in Claude:

**Generate Text:**
> "Use the frontal AI service to write a professional email about a project update"

**Generate Images:**
> "Create an image of a futuristic cityscape at sunset using frontal image generation"

**Upload Files:**
> "Upload this document to frontal blob storage: [file content]"

**Run Functions:**
> "Execute the process-user-data function with this payload: {...}"

### Cline Integration

#### VS Code Extension Setup

1. Install Cline extension in VS Code
2. Configure MCP settings in VS Code:

```json
{
  "cline.mcpServers": {
    "frontal": {
      "command": "frontal-mcp-server",
      "args": ["--transport", "stdio"],
      "env": {
        "FRONTAL_API_KEY": "${env:FRONTAL_API_KEY}"
      }
    }
  }
}
```

#### Usage Patterns

```typescript
// In your VS Code workspace
// Cline can now access Frontal services through MCP
```

### Custom AI Assistant Integration

#### HTTP Transport Example

```typescript
import { FrontalMcpServer } from '@frontal-labs/mcp-server';

// Start server with HTTP transport
const server = new FrontalMcpServer({
  apiKey: 'your_api_key',
  transport: {
    transport: 'http',
    http: {
      host: 'localhost',
      port: 3000
    }
  }
});

await server.initialize();
await server.connectHttp();

// Your AI assistant can now make HTTP requests
// POST http://localhost:3000/call-tool
// {
//   "tool": "ai-generate-text",
//   "arguments": {
//     "model": "frontal-gpt-4",
//     "prompt": "Hello world"
//   }
// }
```

#### Programmatic Integration

```typescript
import { FrontalMcpServer } from '@frontal-labs/mcp-server';

class MyAIAssistant {
  private mcpServer: FrontalMcpServer;
  
  constructor() {
    this.mcpServer = new FrontalMcpServer({
      apiKey: process.env.FRONTAL_API_KEY,
      transport: { transport: 'stdio' }
    });
  }
  
  async initialize() {
    await this.mcpServer.initialize();
    await this.mcpServer.connectStdio();
  }
  
  async processUserRequest(request: string) {
    // Parse request and call appropriate MCP tool
    if (request.includes('generate text')) {
      return await this.mcpServer.callTool('ai-generate-text', {
        model: 'frontal-gpt-4',
        prompt: request
      });
    }
    // Handle other request types...
  }
}
```

## Use Cases and Examples

### Content Creation Workflow

```typescript
// Example: Automated blog post generation
async function createBlogPost(topic: string) {
  // 1. Generate outline
  const outline = await mcpServer.callTool('ai-generate-text', {
    model: 'frontal-gpt-4',
    prompt: `Create a detailed outline for a blog post about ${topic}`,
    maxTokens: 500
  });
  
  // 2. Generate content for each section
  const sections = await Promise.all(
    outline.data.sections.map(async (section) => {
      return await mcpServer.callTool('ai-generate-text', {
        model: 'frontal-gpt-4',
        prompt: `Write detailed content for: ${section.title}`,
        maxTokens: 1000
      });
    })
  );
  
  // 3. Generate featured image
  const image = await mcpServer.callTool('ai-generate-image', {
    prompt: `Professional blog post image about ${topic}`,
    size: '1024x1024',
    quality: 'hd'
  });
  
  // 4. Upload image to blob storage
  const uploadedImage = await mcpServer.callTool('blob-upload', {
    bucket: 'blog-images',
    key: `${topic}-featured.jpg`,
    content: image.data.url // Assuming URL-based upload
  });
  
  return {
    outline: outline.data,
    sections: sections.map(s => s.data),
    featuredImage: uploadedImage.data
  };
}
```

### Data Processing Pipeline

```typescript
// Example: ETL pipeline with Frontal services
async function runDataPipeline(dataFile: string) {
  // 1. Upload raw data to blob storage
  const uploadResult = await mcpServer.callTool('blob-upload', {
    bucket: 'raw-data',
    key: `uploads/${Date.now()}-${dataFile}`,
    content: fs.readFileSync(dataFile, 'base64'),
    contentType: 'application/json'
  });
  
  // 2. Trigger data processing function
  const processResult = await mcpServer.callTool('functions-invoke', {
    name: 'process-customer-data',
    payload: {
      inputFile: uploadResult.data.key,
      outputBucket: 'processed-data'
    },
    invokeAsync: false
  });
  
  // 3. Create pipeline for future automation
  const pipeline = await mcpServer.callTool('pipelines-create', {
    name: 'customer-data-processing',
    description: 'Automated customer data ETL pipeline',
    steps: [
      {
        name: 'upload',
        type: 'blob-upload',
        config: { bucket: 'raw-data' }
      },
      {
        name: 'process',
        type: 'function',
        config: { functionName: 'process-customer-data' }
      },
      {
        name: 'store',
        type: 'graph-create-node',
        config: { nodeType: 'ProcessedCustomer' }
      }
    ]
  });
  
  return {
    uploadId: uploadResult.data.key,
    processResult: processResult.data,
    pipelineId: pipeline.data.pipelineId
  };
}
```

### Knowledge Management System

```typescript
// Example: Building a knowledge graph
async function buildKnowledgeGraph(document: string) {
  // 1. Generate embeddings for semantic search
  const embeddings = await mcpServer.callTool('ai-embed', {
    text: document,
    model: 'frontal-embed-3-large'
  });
  
  // 2. Extract entities and relationships
  const entities = await mcpServer.callTool('ai-generate-text', {
    model: 'frontal-gpt-4',
    prompt: `Extract entities and relationships from this document: ${document}`,
    maxTokens: 1000
  });
  
  // 3. Create nodes in graph database
  const nodes = await Promise.all(
    entities.data.entities.map(async (entity) => {
      return await mcpServer.callTool('graph-create-node', {
        type: entity.type,
        properties: {
          name: entity.name,
          description: entity.description,
          embedding: embeddings.data.embedding
        }
      });
    })
  );
  
  // 4. Store document in blob storage
  const documentStorage = await mcpServer.callTool('blob-upload', {
    bucket: 'knowledge-base',
    key: `documents/${Date.now()}.txt`,
    content: Buffer.from(document).toString('base64'),
    contentType: 'text/plain'
  });
  
  return {
    nodes: nodes.map(n => n.data),
    documentUrl: documentStorage.data.url,
    embedding: embeddings.data.embedding
  };
}
```

### Automated Customer Support

```typescript
// Example: Customer support automation
class CustomerSupportBot {
  constructor(private mcpServer: FrontalMcpServer) {}
  
  async handleCustomerQuery(query: string, customerId: string) {
    // 1. Generate response using AI
    const response = await this.mcpServer.callTool('ai-generate-text', {
      model: 'frontal-gpt-4',
      prompt: `Customer query: ${query}. Generate a helpful response.`,
      maxTokens: 500,
      temperature: 0.7
    });
    
    // 2. Check customer history in graph database
    const customerHistory = await this.mcpServer.callTool('graph-query', {
      query: `
        MATCH (c:Customer {id: $customerId})-[:HAS_TICKET]->(t:Ticket)
        RETURN t ORDER BY t.created DESC LIMIT 5
      `,
      variables: { customerId }
    });
    
    // 3. Log interaction
    await this.mcpServer.callTool('functions-invoke', {
      name: 'log-customer-interaction',
      payload: {
        customerId,
        query,
        response: response.data.text,
        timestamp: new Date().toISOString()
      },
      invokeAsync: true
    });
    
    // 4. Upload conversation transcript
    await this.mcpServer.callTool('blob-upload', {
      bucket: 'support-transcripts',
      key: `${customerId}/${Date.now()}.json`,
      content: Buffer.from(JSON.stringify({
        query,
        response: response.data.text,
        history: customerHistory.data
      })).toString('base64'),
      contentType: 'application/json'
    });
    
    return {
      response: response.data.text,
      hasHistory: customerHistory.data.nodes.length > 0,
      ticketId: this.generateTicketId()
    };
  }
  
  private generateTicketId(): string {
    return `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

## Advanced Usage Patterns

### Batch Processing

```typescript
// Process multiple items efficiently
async function batchProcessDocuments(documents: string[]) {
  const batchSize = 5;
  const results = [];
  
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(doc => 
        this.mcpServer.callTool('ai-embed', {
          text: doc,
          model: 'frontal-embed-3-large'
        })
      )
    );
    
    results.push(...batchResults);
    
    // Rate limiting - small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}
```

### Error Handling and Retry Logic

```typescript
async function robustAPICall(toolName: string, args: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.mcpServer.callTool(toolName, args);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      console.log(`Retry ${attempt}/${maxRetries} for ${toolName}`);
    }
  }
}
```

### Streaming Responses

```typescript
// Handle long-running operations
async function* streamTextGeneration(prompt: string) {
  const chunks = [];
  
  // Generate in smaller chunks for streaming effect
  for (let i = 0; i < 5; i++) {
    const chunk = await this.mcpServer.callTool('ai-generate-text', {
      model: 'frontal-gpt-4',
      prompt: `${prompt} (part ${i + 1}/5)`,
      maxTokens: 200
    });
    
    yield chunk.data.text;
    chunks.push(chunk.data.text);
  }
  
  return chunks.join('');
}
```

## Configuration Best Practices

### Environment-Specific Configs

```typescript
// config/development.ts
export const devConfig = {
  apiKey: process.env.FRONTAL_API_KEY,
  transport: { transport: 'stdio' },
  services: {
    ai: true,
    blob: true,
    functions: true,
    graph: true,
    pipelines: true
  },
  logLevel: 'debug'
};

// config/production.ts
export const prodConfig = {
  apiKey: process.env.FRONTAL_API_KEY,
  transport: {
    transport: 'http',
    http: {
      host: '0.0.0.0',
      port: 3000
    }
  },
  services: {
    ai: true,
    blob: true,
    functions: true,
    graph: false, // Disabled in production
    pipelines: true
  },
  logLevel: 'info'
};
```

### Service Health Monitoring

```typescript
async function checkServiceHealth() {
  const healthChecks = await Promise.allSettled([
    this.mcpServer.callTool('ai-generate-text', {
      model: 'frontal-gpt-4',
      prompt: 'Health check',
      maxTokens: 10
    }),
    this.mcpServer.callTool('blob-list', {
      bucket: 'health-check',
      maxKeys: 1
    }),
    this.mcpServer.callTool('functions-list', {
      status: 'active'
    })
  ]);
  
  return {
    ai: healthChecks[0].status === 'fulfilled',
    blob: healthChecks[1].status === 'fulfilled',
    functions: healthChecks[2].status === 'fulfilled'
  };
}
```

## Troubleshooting

### Common Issues

#### Connection Problems

```bash
# Check if server is running
ps aux | grep frontal-mcp-server

# Test with different transport
frontal-mcp-server --transport http --port 3000

# Check API key validity
curl -H "Authorization: Bearer $FRONTAL_API_KEY" \
  https://api.frontal.dev/v1/health
```

#### Performance Issues

```typescript
// Add performance monitoring
const startTime = Date.now();
const result = await this.mcpServer.callTool(toolName, args);
const duration = Date.now() - startTime;

if (duration > 5000) {
  console.warn(`Slow operation: ${toolName} took ${duration}ms`);
}
```

#### Memory Management

```typescript
// Clear caches periodically
setInterval(() => {
  if (global.gc) {
    global.gc();
  }
}, 60000); // Every minute
```

## Security Considerations

### API Key Management

```typescript
// Use environment variables, never hardcode keys
const config = {
  apiKey: process.env.FRONTAL_API_KEY,
  // Never commit this to version control
};

// Rotate keys regularly
async function rotateApiKey() {
  const newKey = await fetchNewApiKey();
  process.env.FRONTAL_API_KEY = newKey;
  
  // Reinitialize server with new key
  await this.mcpServer.reinitialize({ apiKey: newKey });
}
```

### Input Validation

```typescript
// Validate inputs before sending to MCP
function validatePrompt(prompt: string): boolean {
  if (prompt.length > 10000) {
    throw new Error('Prompt too long');
  }
  if (prompt.includes('<script>')) {
    throw new Error('Invalid characters in prompt');
  }
  return true;
}
```

## Performance Optimization

### Caching Strategy

```typescript
class CachedMCPClient {
  private cache = new Map();
  
  async callTool(toolName: string, args: any) {
    const cacheKey = `${toolName}:${JSON.stringify(args)}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    const result = await this.mcpServer.callTool(toolName, args);
    
    // Cache for 5 minutes
    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);
    
    return result;
  }
}
```

### Connection Pooling

```typescript
// Reuse connections for HTTP transport
const server = new FrontalMcpServer({
  apiKey: process.env.FRONTAL_API_KEY,
  transport: {
    transport: 'http',
    http: {
      host: 'localhost',
      port: 3000,
      maxConnections: 10,
      keepAlive: true
    }
  }
});
```

## Monitoring and Analytics

### Usage Tracking

```typescript
class UsageTracker {
  private metrics = {
    totalCalls: 0,
    callsByTool: new Map(),
    errors: 0
  };
  
  async trackCall(toolName: string, args: any) {
    this.metrics.totalCalls++;
    this.metrics.callsByTool.set(
      toolName,
      (this.metrics.callsByTool.get(toolName) || 0) + 1
    );
    
    try {
      const result = await this.mcpServer.callTool(toolName, args);
      return result;
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }
  
  getReport() {
    return {
      totalCalls: this.metrics.totalCalls,
      toolBreakdown: Object.fromEntries(this.metrics.callsByTool),
      errorRate: this.metrics.errors / this.metrics.totalCalls
    };
  }
}
```

## Next Steps

- Explore the [API Documentation](./API.md) for detailed tool specifications
- Check the [Developer Guide](./DEVELOPERS.md) for extending the server
- Review the examples in the repository for more integration patterns
- Join the community Discord for support and discussions