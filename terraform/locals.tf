locals {
  # workspace 名をそのまま環境名として使う（dev / prod）。
  # デプロイは `terraform workspace select dev|prod` で切り替える。
  environment = terraform.workspace

  # 各リソース名に付けるサフィックス（例: secondary-comics-app-dev）。
  name_suffix = "-${local.environment}"

  # admin（編集ツール）フロントを配信している S3 バケットのオリジン。
  # 環境ごとに <project>-admin-web-<env> を CORS 許可する（API GW / assets バケット双方）。
  admin_web_origin = "https://${var.project_name}-admin-web${local.name_suffix}.s3.${var.region}.amazonaws.com"
}
