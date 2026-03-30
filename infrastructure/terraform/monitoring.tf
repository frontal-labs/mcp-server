# Prometheus & Grafana Monitoring Stack (if enabled)
resource "helm_release" "prometheus" {
  count      = var.enable_monitoring ? 1 : 0
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  namespace  = "monitoring"
  create_namespace = true

  set {
    name  = "prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage"
    value = "20Gi"
  }

  set {
    name  = "grafana.persistence.storage"
    value = "10Gi"
  }

  set {
    name  = "grafana.persistence.type"
    value = "pvc"
  }

  set {
    name  = "grafana.adminPassword"
    value = random_password.grafana_admin.result
  }

  depends_on = [module.eks]
}

# CloudWatch Container Insights
resource "aws_cloudwatch_log_group" "application" {
  count = var.enable_logging ? 1 : 0
  name  = "/aws/eks/${var.cluster_name}/application"
  
  retention_in_days = 30

  tags = {
    Name        = "${var.project_name}-application-logs"
    Environment = var.environment
  }
}

# IAM Policy for CloudWatch logging
resource "aws_iam_policy" "cloudwatch_logs" {
  count = var.enable_logging ? 1 : 0
  name  = "${var.project_name}-cloudwatch-logs-policy"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
          "logs:DescribeLogGroups"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Attach policy to node role
resource "aws_iam_role_policy_attachment" "cloudwatch_logs" {
  count      = var.enable_logging ? 1 : 0
  policy_arn = aws_iam_policy.cloudwatch_logs[0].arn
  role       = module.eks.eks_managed_node_groups["main"].iam_role_name
}

# Random password for Grafana
resource "random_password" "grafana_admin" {
  length  = 16
  special = true
}
