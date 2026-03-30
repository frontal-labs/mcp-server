# Frontal MCP Server Infrastructure

This directory contains all the infrastructure configuration for deploying and managing the Frontal MCP Server in production and development environments.

## 📁 Directory Structure

```
infrastructure/
├── docker/          # Docker configurations
├── kubernetes/      # Kubernetes manifests
├── terraform/       # Terraform IaC
├── monitoring/      # Monitoring and observability
├── ci/             # CI/CD pipeline configurations
└── docs/           # Documentation
```

## 🐳 Docker Configuration

### Files
- `Dockerfile` - Multi-stage build for production
- `docker-compose.dev.yml` - Development environment with monitoring
- `docker-compose.prod.yml` - Production environment with nginx
- `.dockerignore` - Docker ignore file
- `.env.example` - Environment variables template

### Usage

#### Development
```bash
# Copy environment file
cp infrastructure/docker/.env.example .env

# Start development environment
docker-compose -f infrastructure/docker/docker-compose.dev.yml up -d

# View logs
docker-compose -f infrastructure/docker/docker-compose.dev.yml logs -f mcp-server
```

#### Production
```bash
# Start production environment
docker-compose -f infrastructure/docker/docker-compose.prod.yml up -d

# Scale the service
docker-compose -f infrastructure/docker/docker-compose.prod.yml up -d --scale mcp-server=3
```

## ☸️ Kubernetes Configuration

### Files
- `namespace.yaml` - Kubernetes namespace
- `deployment.yaml` - Application deployment
- `service.yaml` - Service configuration
- `ingress.yaml` - Ingress with TLS
- `secrets.yaml` - Kubernetes secrets
- `configmap.yaml` - Configuration data
- `hpa.yaml` - Horizontal Pod Autoscaler

### Deployment

#### Prerequisites
- Kubernetes cluster (EKS, GKE, or AKS)
- kubectl configured
- cert-manager installed (for TLS)

#### Steps
```bash
# Create namespace
kubectl apply -f infrastructure/kubernetes/namespace.yaml

# Apply secrets (update with actual values)
kubectl apply -f infrastructure/kubernetes/secrets.yaml

# Deploy application
kubectl apply -f infrastructure/kubernetes/

# Check deployment status
kubectl get pods -n mcp-server
kubectl get services -n mcp-server
kubectl get ingress -n mcp-server
```

## 🏗️ Terraform Infrastructure

### Files
- `main.tf` - Main Terraform configuration
- `variables.tf` - Input variables
- `eks.tf` - EKS cluster configuration
- `monitoring.tf` - Monitoring stack
- `outputs.tf` - Output values

### Usage

#### Initialize
```bash
cd infrastructure/terraform
terraform init
```

#### Plan
```bash
terraform plan -var-file="terraform.tfvars"
```

#### Apply
```bash
terraform apply -var-file="terraform.tfvars" -auto-approve
```

#### Destroy
```bash
terraform destroy -var-file="terraform.tfvars" -auto-approve
```

### Variables
Create a `terraform.tfvars` file:

```hcl
aws_region = "us-east-1"
environment = "production"
cluster_name = "frontal-mcp-server-prod"
domain_name = "frontal.dev"
enable_monitoring = true
enable_logging = true
```

## 📊 Monitoring and Observability

### Components
- **Prometheus** - Metrics collection
- **Grafana** - Visualization and dashboards
- **AlertManager** - Alert management
- **CloudWatch** - Logging (AWS)

### Files
- `prometheus.yml` - Prometheus configuration
- `alert_rules.yml` - Alert rules
- `grafana/dashboards/` - Grafana dashboard definitions

### Access Points

#### Development (Docker Compose)
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)

#### Production (Kubernetes)
- Access via port-forward:
```bash
kubectl port-forward -n monitoring svc/prometheus-server 9090:80
kubectl port-forward -n monitoring svc/grafana 3000:80
```

## 🚀 CI/CD Pipelines

### GitHub Actions
- File: `ci/github-actions.yml`
- Triggers: Push to main/develop, PRs, releases
- Environments: staging, production

### GitLab CI
- File: `ci/gitlab-ci.yml`
- Similar workflow to GitHub Actions

### Pipeline Stages
1. **Test** - Unit tests, linting, type checking
2. **Security** - Vulnerability scanning
3. **Build** - Docker image building and pushing
4. **Deploy** - Kubernetes deployment
5. **Terraform** - Infrastructure management

## 🔧 Environment Configuration

### Required Environment Variables

#### Application
- `FRONTAL_API_KEY` - Frontal API key
- `FRONTAL_BASE_URL` - API base URL
- `NODE_ENV` - Environment (development/production)

#### Service Toggles
- `ENABLE_AI` - Enable AI service
- `ENABLE_BLOB` - Enable Blob service
- `ENABLE_FUNCTIONS` - Enable Functions service
- `ENABLE_GRAPH` - Enable Graph service
- `ENABLE_PIPELINES` - Enable Pipelines service

#### Infrastructure
- `MCP_LOG_LEVEL` - Logging level
- `KUBE_CONFIG_*` - Kubernetes configuration
- `AWS_*` - AWS credentials (for Terraform)

## 🛠️ Local Development Setup

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ and Bun
- kubectl (for Kubernetes)
- Terraform (for IaC)

### Quick Start
```bash
# 1. Clone and setup
git clone <repository>
cd mcp-server

# 2. Copy environment file
cp infrastructure/docker/.env.example .env

# 3. Start development environment
docker-compose -f infrastructure/docker/docker-compose.dev.yml up -d

# 4. Install dependencies for local development
bun install

# 5. Run tests
bun run test

# 6. Start local development server
bun run dev
```

## 🔍 Troubleshooting

### Common Issues

#### Docker Issues
```bash
# Clean up Docker resources
docker system prune -a
docker volume prune

# Rebuild containers
docker-compose -f infrastructure/docker/docker-compose.dev.yml build --no-cache
```

#### Kubernetes Issues
```bash
# Check pod status
kubectl describe pod -n mcp-server

# Check logs
kubectl logs -f deployment/frontal-mcp-server -n mcp-server

# Restart deployment
kubectl rollout restart deployment/frontal-mcp-server -n mcp-server
```

#### Terraform Issues
```bash
# Reinitialize Terraform
rm -rf .terraform
terraform init

# Check state
terraform show

# Import existing resources if needed
terraform import <resource> <resource_id>
```

## 📚 Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Terraform Documentation](https://www.terraform.io/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Docker Documentation](https://docs.docker.com/)

## 🤝 Contributing

When making changes to infrastructure:

1. **Test locally** before committing
2. **Update documentation** for any configuration changes
3. **Follow naming conventions** for resources
4. **Add tags** for all cloud resources
5. **Review security implications** of changes

## 🔐 Security Considerations

- API keys are stored in Kubernetes secrets
- Terraform state is encrypted in S3
- Images are scanned for vulnerabilities
- Network policies restrict traffic
- RBAC limits access to resources
- TLS is enforced for all communications
