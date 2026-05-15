# Terraform deployment

This folder provisions the smallest practical AWS stack for SatPlan:

- One public EC2 instance
- Docker installed at boot
- An ECR repository for the SatPlan image
- A container started automatically from the ECR image
- An Elastic IP for a stable public address
- A dedicated EBS volume mounted into the container at `/data`

## What is created

The default stack uses the default AWS VPC and creates the instance, security group, Elastic IP, ECR repository, EBS data volume, and supporting IAM resources.

## Deploy

1. Install Terraform and configure AWS credentials locally.
2. Copy `terraform.tfvars.example` to `terraform.tfvars` and keep `image_tag` set to the tag you plan to push, usually `latest`.
3. Run `terraform init`.
4. Run `terraform apply`.
5. Push your container image to the ECR repository shown in `ecr_repository_url`.
6. Open the `app_url` output in a browser once the image has been pushed.

## Image push example

Terraform creates the ECR repository for you, so the usual flow is:

```bash
docker build -t satplan .
docker tag satplan:latest <ECR_REPOSITORY_URL>:latest
docker push <ECR_REPOSITORY_URL>:latest
```

## Notes

- The container gets `PORT` and `DB_PATH` from the boot script; the current Go service already supports both.
- The stack exposes HTTP on port 80 of the EC2 instance.
- SQLite is stored on the separate EBS volume mounted at `/opt/satplan/data`, so it survives container restarts and instance rebuilds as long as you keep the volume.
- The EC2 instance has permission to pull from ECR using an instance profile.
