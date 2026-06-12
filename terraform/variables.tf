variable "region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-northeast-1"
}

variable "project_name" {
  description = "Prefix used to name all resources"
  type        = string
  default     = "secondary-comics"
}
