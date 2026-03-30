output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  description = "Certificate authority data for EKS cluster"
  value       = module.eks.cluster_certificate_authority_data
}

output "cluster_name" {
  description = "Name of the EKS cluster"
  value       = module.eks.cluster_name
}

output "node_group_role_arn" {
  description = "ARN of the node group IAM role"
  value       = module.eks.eks_managed_node_groups["main"].iam_role_arn
}

output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "private_subnets" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnets
}

output "grafana_admin_password" {
  description = "Grafana admin password"
  value       = var.enable_monitoring ? random_password.grafana_admin.result : null
  sensitive   = true
}
