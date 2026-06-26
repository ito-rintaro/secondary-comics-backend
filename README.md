# secondary-comics-backend

DynamoDB + Lambda + API Gateway による、二次流通コミックの資産管理 API。
インフラは Terraform で構築する。**Cognito 認証付き**で、ログイン中ユーザーの
コレクションを返す。API 仕様は [docs/openapi.yaml](docs/openapi.yaml) を参照。

## アーキテクチャ

```
クライアント ──HTTP──> API Gateway (HTTP API)
                          │  JWT Authorizer (Cognito)
                          │  AWS_PROXY
                          ▼
                       Lambda (Node.js 22 / TypeScript・クリーンアーキ)
                          │  AWS SDK v3
                          ▼
                       DynamoDB (single-table: secondary-comics-app)
```

| パス | メソッド | 動作 | 認証 |
|------|----------|------|------|
| `/health` | GET | ヘルスチェック | 不要 |
| `/collection` | GET | ログイン中ユーザーのコレクション一覧を取得 | Cognito JWT 必須 |

- `userId` はリクエストでは受け取らず、JWT の `sub` から取得する（他人のデータを指定不可）。
- 登録・編集・削除（save / delete）は現状スコープ外。データは DynamoDB へ手動投入する
  （手順は [docs/commands.md](docs/commands.md)）。

## ディレクトリ構成

```
lambda/        Lambda 関数本体（TypeScript / クリーンアーキテクチャ）
  src/
    domain/        … 純粋な型・ルール（CollectionItem 等。外部依存ゼロ）
    application/   … usecase（ListCollection）と port（CollectionRepository）
    adapters/      … http(入力) と persistence/dynamo(出力) の変換・実装
    config/        … 環境変数の読み取り
    handler.ts     … 合成ルート（依存を組み立てて router へ）
  dist/          … esbuild の出力（index.mjs）。デプロイ時に zip される（gitignore）
terraform/     インフラ定義（*.tf）
scripts/       デプロイ・サンプルデータ投入スクリプト
docs/          API 仕様（openapi.yaml）・設計（architecture.md）・コマンド早見表
```

依存方向は内向きのみ（`domain ← application ← adapters ← handler`）。
DynamoDB 依存は `adapters/persistence/dynamo` に閉じ込めてあり、保存先の差し替えやテストが容易。
設計の詳細・拡張手順は [docs/architecture.md](docs/architecture.md) を参照。

## 前提ツールのインストール（初回のみ）

この環境には terraform / aws CLI / Node.js が未インストール。Windows なら:

```powershell
# winget を使う場合
winget install Hashicorp.Terraform
winget install Amazon.AWSCLI
winget install OpenJS.NodeJS.LTS   # Node.js 22（Lambda のビルドに必要）
```

> `deploy.ps1` は内部で `npm ci` / `npm run build`（esbuild）を実行するため、
> Node.js（v22 系）が必須。

インストール後、ターミナルを開き直して確認:

```powershell
terraform version
aws --version
node --version
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
環境サフィックス（`-dev` / `-prod`）が付く（例: `secondary-comics-app-dev`）。
dev と prod は独立しており、互いに影響しない。

## デプロイ手順

プロジェクト直下から、環境を引数で渡すだけ（Lambda のビルドと workspace の選択も自動）:

```powershell
.\scripts\deploy.ps1 dev     # dev にデプロイ
.\scripts\deploy.ps1 prod    # prod にデプロイ
```

`deploy.ps1` は内部で Lambda(TypeScript) を `npm run build`（esbuild で `dist/index.mjs` に
バンドル）してから `terraform apply` する。完了すると、その環境の API URL などが出力される:

```
api_base_url   = "https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com"
environment    = "dev"
app_table_name = "secondary-comics-app-dev"
```

この URL を控えておく（後述の `<API_URL>` に使う）。

> 手動で Terraform を叩く場合は、先に `cd lambda && npm install && npm run build` で
> `dist/index.mjs` を生成してから、`cd terraform` →
> `terraform workspace select -or-create dev` → `terraform apply`。
> （`archive_file` は `lambda/dist` を zip するため、ビルド前だと失敗する。）
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

## データの投入

API は読み取り専用（GET のみ）。コレクションは DynamoDB の `app` テーブルへ手動投入する。
キー設計（`PK="USER#<sub>"` / `SK="COLLECTION#<id>"` / `data` に中身）と
`aws dynamodb put-item` の例は [docs/commands.md](docs/commands.md) を参照。

## 動作確認（curl の例）

`/health` は認証不要。`/collection` は Cognito の JWT が必須（トークン取得手順は
[docs/commands.md](docs/commands.md) の「Cognito 認証」を参照）。

```bash
# ヘルスチェック（認証不要）
curl.exe <API_URL>/health
# => {"status":"ok"}

# コレクション取得（要トークン）
curl.exe -H "Authorization: Bearer <IDトークン>" <API_URL>/collection
# => [ { "id": "...", "title": "...", ... } ]
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

- `/collection` は Cognito JWT 必須。`/health` のみ認証不要。
- `terraform/*.tfstate` には構成情報が入るためコミットしない（`.gitignore` 済み）。
- `lambda/dist` と `lambda/node_modules` はビルド成果物・依存のためコミットしない（`.gitignore` 済み）。
