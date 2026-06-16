locals {
  # workspace 名をそのまま環境名として使う（dev / prod）。
  # デプロイは `terraform workspace select dev|prod` で切り替える。
  environment = terraform.workspace

  # 各リソース名に付けるサフィックス（例: secondary-comics-app-dev）。
  name_suffix = "-${local.environment}"
}
