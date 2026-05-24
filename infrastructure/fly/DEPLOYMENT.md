# Fly.io Deployment Guide

This document covers the Fly.io deployment configuration for the Frontal MCP Server.

## Architecture

The application runs as a stateless HTTP server on Fly.io using the Fly Launch platform.
It uses the Streamable HTTP transport for MCP protocol communication.

### Infrastructure

- **Platform**: Fly.io (Fly Launch / Machines)
- **Runtime**: Node.js 20 (Alpine Linux)
- **Transport**: HTTP on port 3000
- **Region**: iad (primary), with multi-region support
- **Scaling**: Auto start/stop with min 1 instance
- **Health**: HTTP /health endpoint + TCP port check + machine check

## Quick Start

### Prerequisites

- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installed
- Fly.io account authenticated (`flyctl auth login`)
- Frontal API key

### Initial Setup

```bash
# 1. Login to Fly.io
flyctl auth login

# 2. Create the app (one-time)
flyctl launch --copy-config --no-deploy

# 3. Set secrets
flyctl secrets set FRONTAL_API_KEY=frt_your_api_key_here
flyctl secrets set FRONTAL_BASE_URL=https://api.frontal.dev/v1

# 4. Deploy
flyctl deploy

# 5. Verify
flyctl status
flyctl checks list
flyctl logs
```

### Deploying Updates

```bash
# Build and deploy from local
flyctl deploy

# Deploy with canary strategy (zero-downtime)
flyctl deploy --strategy canary

# Deploy with blue-green strategy
flyctl deploy --strategy bluegreen

# Deploy from CI
flyctl deploy --remote-only
```

## Configuration Reference

### fly.toml

The main configuration file (`fly.toml`) at the project root defines:

| Section | Purpose |
|---------|---------|
| `[build]` | Docker build configuration |
| `[http_service]` | HTTP endpoint, health checks, concurrency |
| `[[vm]]` | VM sizing and resource allocation |
| `[env]` | Runtime environment variables |
| `[deploy]` | Deployment strategy |
| `[[checks]]` | Top-level health monitoring |

### Health Checks

Three layers of health monitoring:

1. **HTTP Check** (`/health`): Application-level health via GET endpoint
2. **TCP Check**: Port reachability verification
3. **Machine Check**: Deploy-time process validation

### VM Sizing

Default: shared-cpu-1x with 512MB RAM

To scale:
```bash
# Scale memory
flyctl scale memory 1024

# Scale VM size
flyctl scale vm performance-1x

# Scale count
flyctl scale count 3
```

## Secrets Management

### Required Secrets

Set via `flyctl secrets set`:

| Secret | Description |
|--------|-------------|
| `FRONTAL_API_KEY` | API key for Frontal services |
| `FRONTAL_BASE_URL` | Frontal API base URL |

### Best Practices

- Use `flyctl secrets set` (not env vars in fly.toml) for sensitive values
- Rotate secrets regularly
- Use GitHub Actions secrets for CI/CD tokens
- Never commit secrets to version control

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/fly-deploy.yml`) automates:

1. Build on the Fly.io remote builder
2. Deploy to production
3. Verify deployment status
4. Run post-deploy smoke tests

### Setup CI/CD

```bash
# 1. Generate a deploy token
flyctl tokens create deploy -o personal

# 2. Add to GitHub Secrets as FLY_API_TOKEN
```

## Monitoring & Observability

### Logs

```bash
# Stream logs
flyctl logs

# View recent logs
flyctl logs --instance <machine-id>

# Search logs
flyctl logs --search "error"
```

### Metrics

Accessible via Fly.io dashboard at `https://fly.io/apps/frontal-mcp-server/monitoring`

### Health Checks

```bash
# List health check status
flyctl checks list

# View app status
flyctl status
```

## Regions

Currently configured for primary deployment in `iad` (Ashburn, VA).

Available regions:

| Code | Location |
|------|----------|
| iad | Ashburn, Virginia (US) |
| ewr | Secaucus, NJ (US) |
| lhr | London, UK |
| fra | Frankfurt, Germany |
| syd | Sydney, Australia |
| nrt | Tokyo, Japan |
| sin | Singapore |

To add regions:
```bash
flyctl regions add lhr
flyctl regions add fra
```

## Scaling

### Horizontal Scaling

```bash
# Scale to 3 instances
flyctl scale count 3

# Scale to 5 instances
flyctl scale count 5
```

### Vertical Scaling

```bash
# Increase memory
flyctl scale memory 1024

# Use dedicated CPU
flyctl scale vm performance-1x
```

### Auto-scaling

Configure autostop/autostart in `fly.toml`:
```toml
[http_service]
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1
```

## Production Hardening

### Security

- Non-root user (`mcpserver`) in container
- Secrets stored in Fly.io encrypted vault
- Force HTTPS via Fly proxy
- TLS termination at edge

### Resource Limits

- CPU: 1 shared core
- Memory: 512MB (adjustable)
- Concurrency: 100 hard limit / 50 soft limit

### Deployment Strategy

- Default: Rolling update (zero-downtime)
- Canary: Single instance validation before full rollout
- Blue-green: Full parallel environment swap

## Troubleshooting

### Common Issues

**Deployment fails**:
```bash
flyctl logs
flyctl status
```

**Health check failing**:
```bash
flyctl checks list
flyctl logs --search "health"
```

**Connection refused**:
- Verify `HOST=0.0.0.0` environment variable
- Check internal_port matches server port
- Verify server starts on correct address

**Build timeout**:
```bash
# Build locally and deploy the image
docker build -t frontal-mcp-server .
flyctl deploy --image frontal-mcp-server
```

### Rollback

```bash
# List releases
flyctl releases

# Rollback to specific release
flyctl releases rollback <version>
```

## Costs

Current configuration is eligible for Fly.io Free Tier:
- 3 shared-cpu-1x VMs (256MB each, but 512MB may incur small cost)
- 3GB persistent storage
- 160GB outbound data transfer

Upgrade to `shared-cpu-1x` with 512MB for production workloads.
