locals {
  name_prefix = var.project_name
  tags = merge(
    {
      Project    = var.project_name
      ManagedBy  = "terraform"
      Repository = "satplan"
    },
    var.tags,
  )

  image_ref = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_subnet" "app" {
  id = data.aws_subnets.default.ids[0]
}

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

resource "aws_ecr_repository" "app" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-ecr"
  })
}

resource "aws_iam_role" "ec2" {
  name = "${local.name_prefix}-ec2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "ec2_ecr_readonly" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name_prefix}-ec2"
  role = aws_iam_role.ec2.name
}

resource "aws_security_group" "app" {
  name        = "${local.name_prefix}-app"
  description = "Allow public HTTP access to SatPlan"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = var.host_port
    to_port     = var.host_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-app-sg"
  })
}

resource "aws_instance" "app" {
  ami                         = data.aws_ami.amazon_linux.id
  instance_type               = var.instance_type
  subnet_id                   = data.aws_subnets.default.ids[0]
  vpc_security_group_ids      = [aws_security_group.app.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  user_data_replace_on_change = true
  user_data                   = <<-EOF
    #!/bin/bash
    set -euxo pipefail

    yum update -y
    yum install -y docker awscli
    systemctl enable --now docker

    DEVICE="/dev/nvme1n1"
    if [ ! -b "$DEVICE" ]; then
      DEVICE="/dev/xvdf"
    fi

    mkdir -p /opt/satplan/data

    if ! blkid "$DEVICE" >/dev/null 2>&1; then
      mkfs.ext4 -F "$DEVICE"
    fi

    UUID=$(blkid -s UUID -o value "$DEVICE")
    if ! grep -q "$UUID" /etc/fstab; then
      echo "UUID=$UUID /opt/satplan/data ext4 defaults,nofail 0 2" >> /etc/fstab
    fi

    mount -a

    aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${element(split("/", aws_ecr_repository.app.repository_url), 0)}

    until docker pull ${local.image_ref}; do
      echo "waiting for ECR image ${local.image_ref}"
      sleep 15
      aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${element(split("/", aws_ecr_repository.app.repository_url), 0)}
    done

    docker rm -f satplan || true
    docker run -d \
      --restart unless-stopped \
      --name satplan \
      -p ${var.host_port}:${var.container_port} \
      -e PORT=${var.container_port} \
      -e DB_PATH=/data/satplan.db \
      -v /opt/satplan/data:/data \
      ${local.image_ref}
  EOF

  root_block_device {
    volume_size = var.root_volume_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = merge(local.tags, {
    Name = local.name_prefix
  })
}

resource "aws_ebs_volume" "data" {
  availability_zone = data.aws_subnet.app.availability_zone
  size              = var.data_volume_size
  type              = "gp3"
  encrypted         = true

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-data"
  })
}

resource "aws_volume_attachment" "data" {
  device_name = var.ebs_device_name
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.app.id
}

resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-eip"
  })
}
