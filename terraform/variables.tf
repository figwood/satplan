variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-west-2"
}

variable "project_name" {
  description = "Name used as the resource prefix"
  type        = string
  default     = "satplan"
}

variable "tags" {
  description = "Additional tags applied to every resource"
  type        = map(string)
  default     = {}
}

variable "image_tag" {
  description = "Tag of the image stored in the ECR repository"
  type        = string
  default     = "latest"
}

variable "instance_type" {
  description = "EC2 instance type used to run the container"
  type        = string
  default     = "t3.small"
}

variable "container_port" {
  description = "Port exposed by the application inside the container"
  type        = number
  default     = 8080
}

variable "host_port" {
  description = "Port exposed on the EC2 instance to the public internet"
  type        = number
  default     = 80
}

variable "root_volume_size" {
  description = "Size of the EC2 root volume in GiB"
  type        = number
  default     = 20
}

variable "data_volume_size" {
  description = "Size of the EBS data volume in GiB"
  type        = number
  default     = 20
}

variable "ebs_device_name" {
  description = "Device name used when attaching the EBS volume"
  type        = string
  default     = "/dev/sdf"
}
