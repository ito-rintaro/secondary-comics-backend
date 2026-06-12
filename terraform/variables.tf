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

variable "allowed_origins" {
  description = "CORS で許可するフロントのオリジン。本番ドメインはここに追加する"
  type        = list(string)
  default     = ["http://localhost:5173"]
}
