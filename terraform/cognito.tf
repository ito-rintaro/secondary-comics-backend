# ユーザーを管理する User Pool。
resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-user-pool"

  # パスワードポリシー（デフォルト相当を明示）
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }
}

# アプリがトークンを発行してもらうための窓口（App Client）。
resource "aws_cognito_user_pool_client" "main" {
  name         = "${var.project_name}-app-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # 認証フロー:
  # - USER_SRP_AUTH      : Amplify(ブラウザ) が既定で使う
  # - USER_PASSWORD_AUTH : CLI でのテスト用
  # - REFRESH_TOKEN_AUTH : トークンの自動更新
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # シークレットなしのパブリッククライアント（テスト/SPA 向け）。
  generate_secret = false
}
