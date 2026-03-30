# Deployment Guide

This guide covers different deployment strategies for the Frontal MCP Server.

## 🚀 Quick Start

### Option 1: Docker Compose (Local Development)

```bash
# Clone repository
git clone <repository-url>
cd mcp-server

# Setup environment
cp infrastructure/docker/.env.example .env
# Edit .env with your API key

# Start services
docker-compose -f infrastructure/docker/docker-compose.dev.yml up -d

# Check status
docker-compose -f infrastructure/docker/docker-compose.dev.yml ps
```

### Option 2: Kubernetes (Production)

```bash
# Apply infrastructure
kubectl apply -f infrastructure/kubernetes/

# Monitor deployment
kubectl get pods -n mcp-server -w
```

## 📋 Prerequisites

### For Docker Deployment
- Docker 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum

### For Kubernetes Deployment
- Kubernetes 1.24+
- kubectl configured
- cert-manager installed
- Load balancer configured

### For Terraform Deployment
- Terraform 1.0+
- AWS CLI configured
- Appropriate IAM permissions

## 🔧 Configuration

### Environment Variables

Create a `.env` file based on `infrastructure/docker/.env.example`:

```bash
# Required
FRONTAL_API_KEY=your_api_key_here

# Optional
FRONTAL_BASE_URL=https://api.frontal.dev/v1
MCP_LOG_LEVEL=info

# Service toggles
ENABLE_AI=true
ENABLE_BLOB=true
ENABLE_FUNCTIONS=true
ENABLE_GRAPH=true
ENABLE_PIPELINES=true
```

### Kubernetes Secrets

Update `infrastructure/kubernetes/secrets.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mcp-server-secrets
  namespace: mcp-server
type: Opaque
data:
  # Base64 encoded values
  frontal-api-key: <base64-encoded-api-key>
```

## 🏗️ Deployment Strategies

### 1. Development (Docker Compose)

Best for local development and testing.

**Features:**
- Hot reloading
- Integrated monitoring
- Easy setup
- Local data persistence

**Commands:**
```bash
# Start development environment
docker-compose -f infrastructure/docker/docker-compose.dev.yml up -d

# View logs
docker-compose -f infrastructure/docker/docker-compose.dev.yml logs -f mcp-server

# Stop services
docker-compose -f infrastructure/docker/docker-compose.dev.yml down
```

### 2. Staging (Kubernetes)

For pre-production testing.

**Features:**
- Production-like environment
- Auto-scaling
- Monitoring integration
- Blue-green deployment ready

**Commands:**
```bash
# Deploy to staging
kubectl apply -f infrastructure/kubernetes/ -n mcp-server-staging

# Update image
kubectl set image deployment/frontal-mcp-server mcp-server=new-image:tag -n mcp-server-staging

# Check rollout
kubectl rollout status deployment/frontal-mcp-server -n mcp-server-staging
```

### 3. Production (Kubernetes + Terraform)

For production workloads.

**Features:**
- Infrastructure as Code
- High availability
- Auto-scaling
- Monitoring and alerting
- Backup and disaster recovery

**Commands:**
```bash
# Deploy infrastructure
cd infrastructure/terraform
terraform init
terraform apply -var-file=production.tfvars

# Deploy application
kubectl apply -f infrastructure/kubernetes/
```

## 🔄 CI/CD Integration

### Automated Deployment Pipeline

The CI/CD pipeline automatically:

1. **Tests** - Runs unit and integration tests
2. **Builds** - Creates Docker image
3. **Scans** - Security vulnerability scanning
4. **Deploys** - Pushes to appropriate environment
5. **Monitors** - Validates deployment health

### Manual Deployment

For manual deployments:

```bash
# Build image
docker build -f infrastructure/docker/Dockerfile -t your-registry/mcp-server:tag .

# Push image
docker push your-registry/mcp-server:tag

# Update deployment
kubectl set image deployment/frontal-mcp-server mcp-server=your-registry/mcp-server:tag -n mcp-server
```

## 📊 Monitoring Setup

### Prometheus Metrics

Access metrics at:
- Development: http://localhost:9090
- Production: `kubectl port-forward -n monitoring svc/prometheus-server 9090:80`

### Grafana Dashboards

Access dashboards at:
- Development: http://localhost:3001 (admin/admin)
- Production: `kubectl port-forward -n monitoring svc/grafana 3000:80`

### Alerting

Alerts are configured for:
- Service downtime
- High resource usage
- Error rate thresholds
- Pod restarts

## 🔍 Troubleshooting

### Common Issues

#### Service Not Starting
```bash
# Check logs
kubectl logs -f deployment/frontal-mcp-server -n mcp-server

# Check events
kubectl describe pod -n mcp-server

# Check configuration
kubectl get configmap mcp-server-config -n mcp-server -o yaml
```

#### High Memory Usage
```bash
# Check resource usage
kubectl top pods -n mcp-server

# Scale deployment
kubectl scale deployment frontal-mcp-server --replicas=5 -n mcp-server

# Update resource limits
kubectl edit deployment frontal-mcp-server -n mcp-server
```

#### Network Issues
```bash
# Test connectivity
kubectl exec -it deployment/frontal-mcp-server -n mcp-server -- curl http://localhost:3000/health

# Check service endpoints
kubectl get endpoints -n mcp-server

# Check ingress
kubectl describe ingress frontal-mcp-server-ingress -n mcp-server
```

### Recovery Procedures

#### Full Recovery
```bash
# Delete deployment
kubectl delete deployment frontal-mcp-server -n mcp-server

# Redeploy
kubectl apply -f infrastructure/kubernetes/deployment.yaml

# Verify
kubectl get pods -n mcp-server
```

#### Rollback
```bash
# Check rollout history
kubectl rollout history deployment/frontal-mcp-server -n mcp-server

# Rollback to previous version
kubectl rollout undo deployment/frontal-mcp-server -n mcp-server
```

## 🛡️ Security Considerations

### Network Security
- Use TLS for all communications
- Implement network policies
- Restrict ingress/egress traffic

### Secrets Management
- Store API keys in Kubernetes secrets
- Use external secret management
- Rotate credentials regularly

### Container Security
- Use non-root containers
- Implement security contexts
- Scan images for vulnerabilities

## 📈 Performance Optimization

### Resource Tuning
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### Auto-scaling
```yaml
# HPA configuration
minReplicas: 2
maxReplicas: 10
targetCPUUtilizationPercentage: 70
targetMemoryUtilizationPercentage: 80
```

### Caching
- Enable Redis for session storage
- Use CDN for static assets
- Implement application-level caching

## 🔄 Maintenance

### Regular Tasks
- Update base images
- Rotate secrets
- Backup configurations
- Review resource usage
- Update dependencies

### Backup Procedures
```bash
# Export configurations
kubectl get deployment,service,configmap,secret -n mcp-server -o yaml > backup.yaml

# Backup Terraform state
terraform state pull > terraform-backup.tfstate
```

### Disaster Recovery
1. Restore from backup
2. Recreate infrastructure
3. Deploy application
4. Validate functionality
5. Monitor performance
