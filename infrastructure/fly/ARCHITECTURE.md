# Fly.io Architecture

## Overview

The Frontal MCP Server runs on Fly.io as a stateless HTTP service using the Fly Launch platform (Machines v2). It uses the Streamable HTTP transport for MCP protocol communication on port 3000.

## Architecture Diagram

```
User/Client
    |
    | HTTPS
    v
Fly Proxy (global Anycast network)
    |  TLS termination | HTTP -> HTTPS redirect
    |  Load balancing  | Health check routing
    v
Fly Machine (iad - primary region)
    +------------------------------------------+
    |  Node.js 20 (Alpine)                     |
    |  User: mcpserver (non-root)              |
    |                                          |
    |  fly.toml config                         |
    |  + [http_service] port 3000              |
    |  + Health checks: /health + TCP          |
    |  + Concurrency: 100/50 (hard/soft)       |
    |  + Machines: shared-cpu-1x, 512MB        |
    |  + Scaling: auto stop/start              |
    |                                          |
    |  Frontal MCP Server                      |
    |  + Enhanced HTTP Transport (port 3000)   |
    |  + /health endpoint                      |
    |  + Adapters: AI, Blob, Functions,        |
    |    Graph, Pipelines                      |
    +------------------------------------------+
           |
           | HTTPS
           v
    Frontal API (api.frontal.dev/v1)
```

## Files Created/Modified

| File | Purpose |
|------|---------|
| `fly.toml` | Fly.io app configuration (root) |
| `Dockerfile` | Multi-stage Docker build (root) |
| `.dockerignore` | Docker build context exclusions |
| `.github/workflows/fly-deploy.yml` | CI/CD pipeline |
| `infrastructure/fly/DEPLOYMENT.md` | Deployment guide |
| `src/server/enhanced-http-transport.ts` | Added `/health` endpoint |

## Configuration Summary

### fly.toml

- **App**: `frontal-mcp-server`
- **Region**: `iad` (Ashburn, VA) - primary
- **Build**: Docker multi-stage (Node 20 Alpine)
- **HTTP**: Port 3000, force HTTPS, concurrency 100/50
- **Health**: HTTP `/health` check (15s) + TCP check (10s) + machine check (30s)
- **VM**: shared-cpu-1x, 512MB RAM
- **Env**: NODE_ENV, MCP_LOG_LEVEL, service toggles
- **Deploy**: Rolling strategy
- **Scaling**: Auto-stop/start, min 1 machine

### Dockerfile

Multi-stage build:
1. `base` - Node 20 Alpine + libc6-compat
2. `deps` - Install dependencies with bun
3. `builder` - Build TypeScript source
4. `runner` - Production image (non-root user, 42MB)

### Health Checks

Three layers:
1. **TCP check** (10s) - Verifies port 3000 is accepting connections
2. **HTTP check** (15s) - GET /health returns 200
3. **Machine check** (30s) - deploy-time node process validation

## Operational Commands

### Deployment
```bash
# Initial deploy
flyctl deploy

# Canary deploy (validate one instance first)
flyctl deploy --strategy canary

# Blue-green deploy
flyctl deploy --strategy bluegreen
```

### Monitoring
```bash
# View status
flyctl status

# Stream logs
flyctl logs

# List health checks
flyctl checks list

# View releases
flyctl releases
```

### Scaling
```bash
# Horizontal
flyctl scale count 3

# Vertical
flyctl scale memory 1024

# VM size
flyctl scale vm performance-1x
```

### Secrets
```bash
flyctl secrets set FRONTAL_API_KEY=frt_your_key
flyctl secrets list
flyctl secrets unset SECRET_NAME
```

### Rollback
```bash
flyctl releases rollback <version>
```

## Prerequisites for Deployment

1. **Fly.io account** with billing configured (trial ended)
2. **Fly CLI** - installed (v0.3.195 confirmed)
3. **API Token** for CI/CD: `flyctl tokens create deploy -o personal`
4. **Secrets**: `FRONTAL_API_KEY` and `FRONTAL_BASE_URL`

## Security

- Non-root user (`mcpserver`) in container
- Secrets stored in Fly.io encrypted vault
- TLS termination at Fly proxy edge
- Docker multi-stage build (no build tools in production image)

## Cost

Current configuration: shared-cpu-1x, 512MB RAM, 1 machine minimum.
Fly.io free tier covers 3 shared-cpu-1x VMs at 256MB each (512MB requires paid plan).
