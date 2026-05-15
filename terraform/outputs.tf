output "instance_id" {
  description = "ID of the EC2 instance running the container"
  value       = aws_instance.app.id
}

output "data_volume_id" {
  description = "ID of the EBS volume used for container data"
  value       = aws_ebs_volume.data.id
}

output "ecr_repository_url" {
  description = "URL of the ECR repository used for SatPlan images"
  value       = aws_ecr_repository.app.repository_url
}

output "public_ip" {
  description = "Elastic IP address assigned to the instance"
  value       = aws_eip.app.public_ip
}

output "public_dns" {
  description = "Public DNS name of the instance"
  value       = aws_instance.app.public_dns
}

output "app_url" {
  description = "URL for accessing SatPlan"
  value       = "http://${aws_eip.app.public_ip}:${var.host_port}"
}
