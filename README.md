# secondary-comics-backend

DynamoDB + Lambda + API Gateway による、コミック情報の CRUD API。
インフラは Terraform で構築する。**公開API（認証なし）の検証用**構成。

## アーキテクチャ

```
クライアント ──HTTP──> API Gateway (HTTP API)
                          │  AWS_PROXY
                          ▼
                       Lambda (Node.js 22)
                          │  AWS SDK v3
                          ▼
                       DynamoDB (secondary-comics-comics)
```

| パス | メソッド | 動作 |
|------|----------|------|
| `/health` | GET | ヘルスチェック（**認証不要**） |
| `/comics` | GET | 一覧取得（Scan） |
| `/comics` | POST | 作成（id 未指定なら UUID 自動採番） |
| `/comics/{id}` | GET | 1件取得 |
| `/comics/{id}` | PUT | 更新（既存にマージ） |
| `/comics/{id}` | DELETE | 削除 |

## ディレクトリ構成

```
lambda/        Lambda 関数本体（index.mjs）
terraform/     インフラ定義（*.tf）
scripts/       デプロイ後のサンプルデータ投入スクリプト
```

## 前提ツールのインストール（初回のみ）

この環境には terraform / aws CLI が未インストール。Windows なら:

```powershell
# winget を使う場合
winget install Hashicorp.Terraform
winget install Amazon.AWSCLI
```

インストール後、ターミナルを開き直して確認:

```powershell
terraform version
aws --version
```

## AWS 認証情報の設定（初回のみ）

IAM ユーザーのアクセスキーを作成し、設定する:

```powershell
aws configure
# AWS Access Key ID / Secret Access Key / region(ap-northeast-1) を入力
```

> Terraform は `aws configure` で設定した認証情報を自動で利用する。

## 環境（dev / prod）

環境ごとに **Terraform workspace** で state を分離している。リソース名には
環境サフィックス（`-dev` / `-prod`）が付く（例: `secondary-comics-comics-dev`）。
dev と prod は独立しており、互いに影響しない。

## デプロイ手順

プロジェクト直下から、環境を引数で渡すだけ（workspace の選択も自動）:

```powershell
.\scripts\deploy.ps1 dev     # dev にデプロイ
.\scripts\deploy.ps1 prod    # prod にデプロイ
```

完了すると、その環境の API URL などが出力される:

```
api_base_url = "https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com"
environment  = "dev"
table_name   = "secondary-comics-comics-dev"
```

この URL を控えておく（後述の `<API_URL>` に使う）。

> 手動で Terraform を叩く場合は `cd terraform` してから
> `terraform workspace select -or-create dev` → `terraform apply`。
> workspace が `dev` / `prod` 以外だと apply 時にガードで止まる。

## state の保存場所（リモートバックエンド）

Terraform の state は **S3 バケットで共有**している（このPCローカルではない）。
これにより、別のPC・チームメンバーからでも同じ状態を見てデプロイできる。

- バケット: `secondary-comics-tfstate-060756462498`
- ロック: S3 ネイティブロック（`use_lockfile = true`。DynamoDB 不要）
- workspace ごとに `env:/<env>/...` のパスで自動分離
- 設定箇所: [terraform/main.tf](terraform/main.tf) の `backend "s3"`

## 別のPC・チームから使う

1. リポジトリを `git clone`
2. AWS 認証情報を設定: `aws configure`（state バケットと対象リソースへの権限が必要）
3. `cd terraform && terraform init`（S3 から state を自動取得）
4. `.\scripts\deploy.ps1 dev`（または prod）でデプロイ

> state は S3 で一元管理されているため、どのPCからでも同じ状態に対して操作できる。
> 同時に apply してもロックで衝突を防ぐ。

## サンプルデータの投入

デプロイ後、出力された URL を渡して実行:

```powershell
node scripts/seed.mjs <API_URL>
```

## 動作確認（curl の例）

```bash
# 一覧
curl <API_URL>/comics

# 作成
curl -X POST <API_URL>/comics \
  -H "content-type: application/json" \
  -d '{"title":"テスト作品","author":"テスト作者"}'

# 1件取得（作成時に返る id を使う）
curl <API_URL>/comics/<id>

# 更新
curl -X PUT <API_URL>/comics/<id> \
  -H "content-type: application/json" \
  -d '{"title":"更新後タイトル"}'

# 削除
curl -X DELETE <API_URL>/comics/<id>
```

> PowerShell では `curl` が `Invoke-WebRequest` の別名になっている。素の curl を使うなら `curl.exe` と打つか、`Invoke-RestMethod` を使う。

## 後片付け（課金を止める）

検証が終わったら、対象環境のリソースをすべて削除する:

```powershell
.\scripts\destroy.ps1 dev     # dev を削除
.\scripts\destroy.ps1 prod    # prod を削除
```

## コスト感

DynamoDB はオンデマンド課金、Lambda / API Gateway はリクエスト課金。
いずれも個人検証レベルのアクセスなら無料枠〜数円程度。`terraform destroy` で完全に消える。

## 注意

- 認証なしの公開APIなので、本番では API Gateway の認証（Cognito / API キー等）を必ず追加する。
- `terraform/*.tfstate` には構成情報が入るためコミットしない（`.gitignore` 済み）。
