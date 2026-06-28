# コマンド早見表

このプロジェクトでよく使うコマンドをまとめる。

## 前提

- ラッパースクリプト（`scripts\deploy.ps1` など）は**プロジェクト直下**から実行する。
- `terraform` を直接叩く場合は `terraform` フォルダ内で実行する（`cd terraform`）。

---

## 環境（dev / prod）の出し分け

環境ごとに **Terraform workspace** で state を分離している。各リソース名には
環境サフィックス（`-dev` / `-prod`）が付く（例: `secondary-comics-app-dev`）。

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

### コレクション取得（`GET /collection` / 認証必須）

`openapi.yaml` 準拠のエンドポイント。**Cognito の JWT が必須**で、トークン無し/無効は `401`。
サーバーは JWT の `sub` を userId として取り出し（`Authorizer` 検証済みクレームから取得。
リクエストでは userId を受け取らない）、**`app` テーブルからそのユーザーの Collection を取得**して返す。
トークンの取得手順は後述の「Cognito 認証」を参照。

```powershell
$base = "<API_URL>"
# トークン無し → 401 Unauthorized
curl.exe "$base/collection"
# トークン付き → 200 + CollectionItem の配列（そのユーザーの所有品）
Invoke-RestMethod "$base/collection" -Headers @{ Authorization = "Bearer $token" }
```

サーバーは `app` テーブルを `PK = "USER#<sub>"` かつ `begins_with(SK, "COLLECTION#")` で Query し、
各レコードに **Catalog（書誌）と現在相場（マーケット）を合成**して `CollectionItem` を返す
（`id` は SK から `COLLECTION#` を除いた値。`market` は保存値ではなく算出値）。

### コレクション作成（`POST /collection` / 認証必須）

`openapi.yaml` 準拠。ログイン中ユーザー（JWT の `sub`）のコレクションに 1 件追加する。
書誌は `catalogId` で既存 Catalog を参照し、本文は所有インスタンス固有の情報だけを入れる
（`id` と `updatedAt` はサーバが採番）。**`catalogId` と `condition` のみ必須**で、他は既定値で
補完される。`catalogId` が実在しない場合は `400`。
**現在相場（market / marketSource）は本文では受け取らない**——マーケットから導出するため。

```powershell
$base = "<API_URL>"
$body = @{
  catalogId = "cat-001"   # 実在する Catalog の id（GET /catalogs で確認）
  condition = "A"
  qty       = 1
  cost      = 8000
  store     = "まんだらけ"
  location  = "本棚A"
  memo      = "初版・帯揃い。"
} | ConvertTo-Json
# 201 + 作成された CollectionItem（Catalog と現在相場を合成した enriched 形）
Invoke-RestMethod "$base/collection" -Method Post `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json; charset=utf-8" -Body $body
```

> 未指定時の既定値: `qty=1` / `cost=0` /
> `purchaseDate`・`store`・`location`・`memo` は空文字。
> `market` は応答で算出される（その `catalogId` のマーケット相場。無ければ 0 /
> `marketSource=estimate`、あれば 価格 / `marketSource=auto`）。

#### コレクションを手動で投入する（app テーブル）

API は読み取り専用（GET のみ）なので、データは DynamoDB へ直接入れる。
**1 件 = 1 レコード**で、キー以外は `data`（Map）にまとめる（属性を増やさないため）。

書誌（`title` / `author` / `publisher` / `volume` / `year` / `flags` / `imageUrl`）は
**Catalog マスタ（`PK="CATALOG"` / `SK="CATALOG#<id>"`）に正規化**されており、コレクションは
それを `catalogId` で参照し、**所有インスタンス固有の情報だけ**を持つ。
→ **先に対象の Catalog を投入してから**コレクションを入れること（Catalog が
無いと、API 応答で書誌・画像が空になる）。

| 属性 | 値 |
|---|---|
| `PK` | `USER#<Cognito の sub>` |
| `SK` | `COLLECTION#<コレクションの id>` |
| `data` | `catalogId`（参照する Catalog）＋ 固有情報（`condition` / `qty` / `cost` / `purchaseDate` / `store` / `location` / `memo` / `updatedAt`）。`market`/`marketSource` は保存しない（読み取り時に算出） |

> `id` はレコードには持たせず、`SK` の `COLLECTION#` を除いた値がそのまま API の `id` になる。
> 書誌・画像は、サーバが `catalogId` から Catalog を引いて合成し応答に載せる（サーバ側 join）。
> `<sub>` は対象ユーザーの Cognito `sub`（`aws cognito-idp admin-get-user ...` の `sub` 属性で確認）。

AWS CLI での投入例（`<App テーブル名>` は `terraform output app_table_name`）:

```powershell
$app = (terraform -chdir=terraform output -raw app_table_name)
# 1) Catalog マスタ（書誌の型＝hub。複数のコレクション/マーケットで共有できる）
aws dynamodb put-item --table-name $app --item (@'
{
  "PK":   {"S": "CATALOG"},
  "SK":   {"S": "CATALOG#cat_akira_obi"},
  "data": {"M": {
    "entityType": {"S": "Catalog"},
    "title":      {"S": "AKIRA 全6巻 初版帯付セット"},
    "author":     {"S": "大友克洋"},
    "publisher":  {"S": "講談社 / KCデラックス"},
    "volume":     {"S": "全6巻"},
    "year":       {"S": "1984"},
    "flags":      {"M": {"firstEd": {"BOOL": true}, "obi": {"BOOL": true}, "special": {"BOOL": false}}},
    "imageUrl":   {"S": ""}
  }}
}
'@ -replace '\r','')

# 2) Collection（catalogId で Catalog を参照。書誌は持たず固有情報のみ）
aws dynamodb put-item --table-name $app --item (@'
{
  "PK":   {"S": "USER#<sub>"},
  "SK":   {"S": "COLLECTION#seed0"},
  "data": {"M": {
    "entityType":   {"S": "CollectionItem"},
    "catalogId":    {"S": "cat_akira_obi"},
    "condition":    {"S": "A"},
    "qty":          {"N": "1"},
    "cost":         {"N": "8000"},
    "purchaseDate": {"S": ""},
    "store":        {"S": "まんだらけ"},
    "location":     {"S": "本棚A"},
    "memo":         {"S": "初版・帯揃い。背ヤケ少なめ。"},
    "updatedAt":    {"N": "1718000000000"}
  }}
}
'@ -replace '\r','')
```

### マーケット取得（`GET /market` / 認証必須）

`openapi.yaml` 準拠のエンドポイント。コレクションと同じく **Cognito の JWT が必須**だが、
マーケットは**全ユーザー共通（グローバル）**のデータなので `sub` による絞り込みは行わない。
サーバーは `market-record` テーブルを `byNew` GSI（`gsiPk="RECORD"`）で Query し、
各行を `MarketRecord`（`id` = `marketRecordId`）に変換して**生の配列**で返す
（検索・ソートはフロント側）。

```powershell
$base = "<API_URL>"
# トークン無し → 401 Unauthorized
curl.exe "$base/market"
# トークン付き → 200 + MarketRecord の配列（全ユーザー共通）
Invoke-RestMethod "$base/market" -Headers @{ Authorization = "Bearer $token" }
```

### カタログ取得（`GET /catalogs` / 認証必須）

`openapi.yaml` 準拠のエンドポイント。Collection / MarketRecord が `catalogId` で参照する
書誌マスタ（Catalog）を**生の配列**で返す。マーケット同様 **全ユーザー共通（グローバル）**
で `sub` 絞り込みは行わない。全件が単一パーティション（`PK="CATALOG"`）に束ねられている
ため、**Query 1 回**で取得する（Scan 不要）。

```powershell
$base = "<API_URL>"
# トークン無し → 401 Unauthorized
curl.exe "$base/catalogs"
# トークン付き → 200 + Catalog の配列（全ユーザー共通）
Invoke-RestMethod "$base/catalogs" -Headers @{ Authorization = "Bearer $token" }
```

> Catalog の手動投入は前述「コレクションを手動で投入する」の
> **Catalog マスタ投入例**（`PK="CATALOG"` / `SK="CATALOG#<id>"`）を参照。

#### マーケット相場を手動で投入する（market-record テーブル）

API は読み取り専用（GET のみ）なので、データは DynamoDB へ直接入れる。
**1 件 = 1 レコード**で、コレクションと違い属性は**トップレベルにフラット**に持つ
（`id` という属性は持たず、`marketRecordId` がそのまま API の `id` になる）。
全件を一覧取得できるよう、**`gsiPk` は必ず `"RECORD"` 固定**にする。

書誌（`title` / `author` / `publisher` / `volume` / `flags` / `imageUrl`）は
**Catalog マスタに正規化**済みで、ここでは持たず `catalogId` で参照する。
→ **先に対象の Catalog を投入してから**入れること（前項のコレクション例の
Catalog 投入を参照。Catalog が無いと書誌・画像が空で返る）。

| 属性 | 値 |
|---|---|
| `marketRecordId` | レコードの id（= API の `id`） |
| `gsiPk` | `"RECORD"` 固定（GSI で全件を 1 束にまとめる） |
| `catalogId` | 参照する Catalog の id（実体は `PK="CATALOG"` / `SK="CATALOG#<id>"`） |
| `seller` | 出品者 / ショップ名 |
| `condition` | `S` / `A` / `B` / `C` |
| `history` | 価格推移（円）の配列。要素数 12・末尾が現在価格 |
| `price` | 現在価格（円）。`history` の末尾と一致 |
| `change` | 期間変化率 `(末尾 - 先頭) / 先頭`（例: `0.18`） |
| `listedAt` | 新着ソート用の数値（大きいほど新しい。GSI `byNew` のキー） |

> 書誌・画像は Catalog 側に持つ。`imageUrl` の規約は [画像（S3 + CloudFront）](#画像s3--cloudfront) を参照。

AWS CLI での投入例（`<Market テーブル名>` は `terraform output market_record_table_name`）:

```powershell
$mr = (terraform -chdir=terraform output -raw market_record_table_name)
# Catalog（PK="CATALOG" / SK="CATALOG#cat_akira_obi"）は投入済みである前提。
aws dynamodb put-item --table-name $mr --item (@'
{
  "marketRecordId": {"S": "mk0"},
  "gsiPk":          {"S": "RECORD"},
  "catalogId":      {"S": "cat_akira_obi"},
  "seller":         {"S": "コレクター田中"},
  "condition":      {"S": "A"},
  "history":        {"L": [
    {"N": "30000"}, {"N": "30500"}, {"N": "31000"}, {"N": "31800"},
    {"N": "32500"}, {"N": "33000"}, {"N": "33600"}, {"N": "34200"},
    {"N": "34800"}, {"N": "35100"}, {"N": "35400"}, {"N": "35400"}
  ]},
  "price":          {"N": "35400"},
  "change":         {"N": "0.18"},
  "listedAt":       {"N": "0"}
}
'@ -replace '\r','')
```

> `gsiPk` を付け忘れると `byNew` GSI に載らず、`GET /market` の結果に出てこないので注意。
> `catalogId` が指す Catalog が無いと、書誌・画像が空のレコードとして返る。

## 画像（S3 + CloudFront）

Catalog（コレクション / マーケットが `catalogId` で参照）の `imageUrl` 用の画像は、
専用の S3 バケットに置き、**CloudFront 経由**でフロントに配信する
（バケット自体は非公開。OAC で CloudFront からのみ読める）。
Terraform 定義は `terraform/assets.tf`。

| 項目 | 値（dev） | 取得 |
|---|---|---|
| S3 バケット（アップロード先） | `secondary-comics-assets-dev-<アカウントID>` | `terraform output assets_bucket_name` |
| 配信ドメイン（フロントが参照） | `<distribution>.cloudfront.net` | `terraform output assets_cdn_domain` |

### `imageUrl` の値の規約

- Catalog の `imageUrl`（DynamoDB）は**ファイル名のみ**（例 `akira_vol1.jpg`）。`images/` やドメインは含めない。
- S3 へは **`images/<ファイル名>`** のキーでアップロードする。
- フロントが配信ドメイン + `/images/` を前置して `https://<cdn>/images/<ファイル名>` を組み立てて表示する。
- 未設定・空文字可。サーバーは未設定なら `imageUrl: ""` を返す（API は壊れない）。
- ファイル名は URL エンコードを避けるため英数字・ハイフン・アンダースコア推奨。

```powershell
$bucket = (terraform -chdir=terraform output -raw assets_bucket_name)
# 画像を images/ プレフィックスでアップロード
aws s3 cp .\akira_vol1.jpg "s3://$bucket/images/akira_vol1.jpg"
# 差し替え時にキャッシュが残る場合は CloudFront を無効化（distribution id は AWS コンソール参照）
# aws cloudfront create-invalidation --distribution-id <ID> --paths "/images/akira_vol1.jpg"
```

> 直接の S3 URL（`...s3.amazonaws.com/...`）は 403。必ず CloudFront ドメインで参照する。

### 設計テーブルへのテストデータ投入（MarketRecord + 単一テーブル app）

テーブル構成:

| テーブル | 内容 | キー |
|---|---|---|
| `market-record` | 相場レコード（独立。GSI あり）。書誌は `catalogId` で `app` の Catalog を参照 | PK=`marketRecordId` |
| `app`（単一テーブル） | Catalog / Collection をまとめて管理 | PK / SK |

`app` のキー設計（型プレフィックスで同居）:

| 種類 | PK | SK |
|---|---|---|
| Catalog | `CATALOG`（固定） | `CATALOG#<catalogId>` |
| Collection | `USER#<userId>` | `COLLECTION#<itemId>` |

> Catalog は書誌（title/author/publisher/volume/year/flags/imageUrl）の **マスタ＝hub**。
> Collection / MarketRecord は `catalogId` で参照し、固有情報だけを持つ（正規化）。
> 一覧取得時はサーバが `catalogId` から Catalog を `BatchGetItem` で引いて合成して返す。

各アイテムは **`PK` / `SK` ＋ `data`（ネスト Map）** の形。
`PK`/`SK` 以外の中身はすべて `data` の中に入れる（SDK が JS オブジェクト ⇄ Map を自動変換）。

```
{ "PK": "...", "SK": "...", "data": { entityType, ...payload } }
```

> `data` 内のフィールドはキー/GSI に使えない（このテーブルは PK/SK アクセスのみ前提）。
> 検索軸を増やしたくなったら、その値だけ `data` の外（トップレベル属性）に出して GSI を張る。

Node の seed ツールで投入する（プレーンな JS オブジェクトを自動マーシャル）。
選択中 workspace のテーブルに入る。

```powershell
cd scripts\seed
npm install        # 初回のみ
node seed.mjs
cd ..\..
```

- MarketRecord は GSI `byNew`（新着順）/ `byPrice`（価格順）でソート取得できる
  （価格推移は MarketRecord 行の `history`（12要素）に直接埋め込む）
- Collection の所有者 ID は test ユーザーの Cognito `sub`。別ユーザーにするには
  `$env:SEED_USER_ID="<sub>"` を設定して実行

#### 単一テーブル app のクエリ例

```powershell
$app = (terraform -chdir=terraform output -raw app_table_name)
$pk  = "USER#<sub>"
# ユーザーの所有品（USER# パーティション配下）を取得
aws dynamodb query --table-name $app `
  --key-condition-expression "PK = :pk AND begins_with(SK, :i)" `
  --expression-attribute-values "{\":pk\":{\"S\":\"$pk\"},\":i\":{\"S\":\"COLLECTION#\"}}"
# Catalog 全件（item-collection。PK 固定で1発取得）
aws dynamodb query --table-name $app --key-condition-expression "PK = :pk" `
  --expression-attribute-values '{\":pk\":{\"S\":\"CATALOG\"}}'
```

> テーブル名は `terraform output` から自動取得するため、対象 workspace を選んでから実行する。

#### GSI ソートの確認例

```powershell
$mr = (terraform -chdir=terraform output -raw market_record_table_name)
# 新着順
aws dynamodb query --table-name $mr --index-name byNew `
  --key-condition-expression "gsiPk = :v" `
  --expression-attribute-values '{\":v\":{\"S\":\"RECORD\"}}' --no-scan-index-forward
# 価格 高い順
aws dynamodb query --table-name $mr --index-name byPrice `
  --key-condition-expression "gsiPk = :v" `
  --expression-attribute-values '{\":v\":{\"S\":\"RECORD\"}}' --no-scan-index-forward
```

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

# トークン付きでコレクションを取得
Invoke-RestMethod "$base/collection" -Headers @{ Authorization = "Bearer $token" }
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
