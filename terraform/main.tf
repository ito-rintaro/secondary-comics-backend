terraform {
  required_version = ">= 1.10"

  # state をS3で共有（別PC/チームからもデプロイ可能に）。
  # workspace ごとに env:/<workspace>/... のパスで自動的に分離される。
  backend "s3" {
    bucket       = "secondary-comics-tfstate-060756462498"
    key          = "secondary-comics/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true # S3ネイティブのロック（DynamoDB不要）
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.region
}
