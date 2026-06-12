# コマンド早見表

このプロジェクトでよく使うコマンドをまとめる。

## 前提

Terraform 系のコマンドは `terraform` フォルダ内で実行する。
最初に1回、移動しておく:

```powershell
cd C:\Users\itori\Documents\secondary-comics-backend\terraform
```

> どこからでも実行したい場合は `-chdir` を付ける:
> ```powershell
> terraform -chdir="C:\Users\itori\Documents\secondary-comics-backend\terraform" apply
> ```

---

## Terraform（インフラ操作）

| 目的 | コマンド | 説明 |
|------|----------|------|
| 初期化 | `terraform init` | 初回 / プロバイダ変更時のみ。プロバイダをダウンロード |
| 確認 | `terraform plan` | 何が作られる/変わるかを表示（実際には変更しない） |
| デプロイ | `terraform apply` | 実際に作成・更新する。`yes` 入力で実行 |
| 削除 | `terraform destroy` | 作ったリソースを全削除。`yes` 入力で実行 |
| 出力表示 | `terraform output` | API URL など output 値を再表示 |

### 基本の流れ

```powershell
terraform plan      # 差分を確認
terraform apply     # デプロイ（確認後に yes）
terraform destroy   # 全削除（確認後に yes）
```

### 確認プロンプトを省略

```powershell
terraform apply -auto-approve     # 即デプロイ
terraform destroy -auto-approve   # 即削除
```

---

## API の動作確認

`<API_URL>` は `terraform output` で表示される `api_base_url` に置き換える。
現在の URL:

```
https://5g71hxivvc.execute-api.ap-northeast-1.amazonaws.com
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

## AWS 認証

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
| 課金を止めたい | `terraform destroy` で全リソースを削除 |
