# ユーザーを管理する User Pool。
resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-user-pool${local.name_suffix}"

  # メールアドレスをユーザー名として使う（メールでサインイン/サインアップ）。
  username_attributes = ["email"]
  # サインアップ時にメール確認コードを送る。
  auto_verified_attributes = ["email"]

  # パスワードポリシー（デフォルト相当を明示）
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }
}

# market / catalog の編集（作成・更新・削除）を許可するユーザーのグループ。
# このグループに入れたユーザーの JWT には cognito:groups=["editor"] が載り、
# Lambda 側（requireEditor）が編集系エンドポイントで所属を検証する。
# ユーザーの追加:
#   aws cognito-idp admin-add-user-to-group \
#     --user-pool-id <pool_id> --username <email> --group-name editor
resource "aws_cognito_user_group" "editor" {
  name         = "editor"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "market/catalog データの編集を許可されたユーザー"
}

# アプリがトークンを発行してもらうための窓口（App Client）。
resource "aws_cognito_user_pool_client" "main" {
  name         = "${var.project_name}-app-client${local.name_suffix}"
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
