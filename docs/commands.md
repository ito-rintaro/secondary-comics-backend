# コマンド早見表

このプロジェクトでよく使うコマンドをまとめる。

## 前提

- ラッパースクリプト（`scripts\deploy.ps1` など）は**プロジェクト直下**から実行する。
- `terraform` を直接叩く場合は `terraform` フォルダ内で実行する（`cd terraform`）。

---

## 環境（dev / prod）の出し分け

環境ごとに **Terraform workspace** で state を分離している。各リソース名には
環境サフィックス（`-dev` / `-prod`）が付く（例: `secondary-comics-comics-dev`）。

### デプロイ・削除（推奨：ラッパースクリプト）

プロジェクト直下から、環境を引数で渡すだけ。workspace の選択も自動。

```powershell
# デプロイ
.\scripts\deploy.ps1 dev
.\scripts\deploy.ps1 prod

# 削除
.\scripts\destroy.ps1 dev
.\scripts\destroy.ps1 prod
```

### 中身（手動で Terraform を叩く場合）

```powershell
cd terraform

terraform workspace select -or-create dev   # 環境を切り替え（無ければ作成）
terraform workspace list                     # 今ある環境の一覧（* が選択中）

terraform plan                               # 差分を確認
terraform apply -auto-approve                # デプロイ
terraform destroy -auto-approve              # 削除
terraform output                             # API URL など出力値を再表示
```

> ⚠️ workspace が `dev` / `prod` 以外（例: `default`）のままだと、
> apply 時にエラーで止まる（誤った環境名でのデプロイを防ぐガード）。

---

## API の動作確認

`<API_URL>` は `terraform output` で表示される `api_base_url` に置き換える。
**値は環境ごとに異なる**ので、対象環境の workspace を選んでから `terraform output` で確認する。
dev の現在値:

```
https://upu69qvm0e.execute-api.ap-northeast-1.amazonaws.com
```

### ヘルスチェック（認証不要）

トークン無しで叩ける。API が生きているかの確認に使う。

```powershell
curl.exe "<API_URL>/health"
# => {"status":"ok"}
```

### サンプルデータ投入

```powershell
node C:\Users\itori\Documents\secondary-comics-backend\scripts\seed.mjs <API_URL>
```

### CRUD（PowerShell の Invoke-RestMethod）

```powershell
$base = "<API_URL>"

# 一覧
Invoke-RestMethod "$base/comics"

# 作成
Invoke-RestMethod -Method Post "$base/comics" -ContentType "application/json" `
  -Body '{"title":"テスト作品","author":"テスト作者"}'

# 1件取得
Invoke-RestMethod "$base/comics/<id>"

# 更新
Invoke-RestMethod -Method Put "$base/comics/<id>" -ContentType "application/json" `
  -Body '{"title":"更新後タイトル"}'

# 削除
Invoke-RestMethod -Method Delete "$base/comics/<id>"
```

> 日本語を含むデータを送るときは、PowerShell に直接打つと文字化けすることがある。
> その場合は `scripts/seed.mjs` のように node 経由か、ファイルから読み込んで送る。

---

## Cognito 認証（API を使うためのトークン取得）

API は Cognito 認証が必須。`Authorization: Bearer <IDトークン>` を付けないと 401 になる。

ユーザー名は **メールアドレス**（`username_attributes = ["email"]`）。
値は**環境ごとに異なる**（`terraform output` で確認）。dev の現在値:

```
User Pool ID : ap-northeast-1_lvEOCAFnu
Client ID    : 2mpap5bool3cskl6uujogpm2n7
```

### テストユーザーを作る（初回のみ）

メールをユーザー名にするので、`--username` にはメールアドレスを渡す。
CLI 検証では確認メールを送らず、`email_verified=true` で検証済み扱いにする。

```powershell
$pool  = "<User Pool ID>"
$email = "test@example.com"
aws cognito-idp admin-create-user --user-pool-id $pool --username $email --message-action SUPPRESS `
  --user-attributes Name=email,Value=$email Name=email_verified,Value=true
aws cognito-idp admin-set-user-password --user-pool-id $pool --username $email --password "TestPass123!" --permanent
```

> パスワードは「8文字以上・大小英字・数字・記号」が必須。

### サインインしてトークンを取得し、API を呼ぶ

```powershell
$client = "<Client ID>"
$email  = "test@example.com"
$base   = "<API_URL>"

# IDトークンを取得（ユーザー名 = メールアドレス）
$auth  = aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH --client-id $client `
  --auth-parameters USERNAME=$email,PASSWORD=TestPass123! | ConvertFrom-Json
$token = $auth.AuthenticationResult.IdToken

# トークン付きで呼ぶ
Invoke-RestMethod "$base/comics" -Headers @{ Authorization = "Bearer $token" }

# 作成の例
Invoke-RestMethod -Method Post "$base/comics" -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" -Body '{"title":"テスト","author":"作者"}'
```

> トークンには有効期限（デフォルト1時間）がある。切れたら再度 `initiate-auth` で取り直す。

---

## AWS 認証（AWS CLI 自体の設定）

| 目的 | コマンド |
|------|----------|
| 認証情報の設定 | `aws configure` |
| ログイン中のユーザー確認 | `aws sts get-caller-identity` |

---

## 困ったとき

| 症状 | 対処 |
|------|------|
| `terraform` / `aws` が認識されない | ターミナル（VSCode）を再起動して PATH を反映する |
| `terraform apply` で権限エラー | IAM ユーザーの権限不足。検証用なら `AdministratorAccess` を付与 |
| 課金を止めたい | `.\scripts\destroy.ps1 dev`（または prod）で該当環境を削除 |
| デプロイ先を間違えた | `terraform workspace list` で選択中の環境（*）を確認 |
