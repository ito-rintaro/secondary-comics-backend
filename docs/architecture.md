# Lambda アーキテクチャ（クリーンアーキテクチャ）

`lambda/` の構造と設計方針をまとめる。TypeScript で実装し、esbuild で
`dist/index.mjs` に1ファイルへバンドルしてデプロイする。

## 基本方針：依存は内向きだけ

```
domain  ←  application(usecase + port)  ←  adapters  ←  handler
 (純粋)         (ビジネスルール)          (変換・実装)   (組み立て)
```

- 内側（`domain` / `application`）は AWS も HTTP も知らない。
- DynamoDB や API Gateway の都合は、いちばん外側（`adapters` / `handler`）に押し出す。
- 矢印の向き（外→内）にだけ依存してよい。内側が外側を import してはいけない。

これにより、保存先（DynamoDB）や入口（API Gateway）を差し替えても
ビジネスロジックは変わらず、ユースケース単体でテストできる。

## ディレクトリ構成

```
lambda/
├─ src/
│  ├─ domain/                      … 純粋な型とルール（外部依存ゼロ）
│  │  ├─ collection/
│  │  │  ├─ CollectionItem.ts      … 所有品1件。openapi.yaml の CollectionItem と一致
│  │  │  ├─ buildCollectionItem.ts … 所有インスタンス + Catalog + 相場 → CollectionItem（純粋関数）
│  │  │  ├─ Condition.ts           … S/A/B/C（market と共有）
│  │  │  ├─ ConditionFlags.ts      … firstEd/obi/special（market と共有）
│  │  │  └─ MarketSource.ts        … manual/auto/estimate
│  │  ├─ market/
│  │  │  ├─ MarketSale.ts          … 成約1件（1件1価格）。openapi.yaml の MarketSale と一致
│  │  │  ├─ MarketSummary.ts       … catalog単位の相場サマリ。openapi.yaml の MarketSummary と一致
│  │  │  └─ summarizeSales.ts      … 成約列 → 現在価格/変化率/月次擬似history の集計（純粋関数）
│  │  └─ catalog/
│  │     └─ Catalog.ts             … 書誌のマスタ（型）。Collection/Market が共通参照する hub
│  │
│  ├─ application/                 … ユースケースと「ポート」(interface)
│  │  ├─ ports/
│  │  │  ├─ CollectionRepository.ts … listByUser(userId) / create(userId, id, catalogId, instance)
│  │  │  ├─ MarketRepository.ts    … listAll() / create / update / remove（成約ログの読み書き）
│  │  │  ├─ MarketSummaryRepository.ts … listSummaries(): catalog単位の相場サマリ
│  │  │  ├─ MarketPriceRepository.ts … pricesByCatalog(ids): catalogId→現在相場（円）
│  │  │  └─ CatalogRepository.ts   … getMany(ids)/listAll()/create/update/remove（書誌の読み書き）
│  │  └─ usecases/
│  │     ├─ ListCollection.ts      … repo を呼んで一覧を返す（AWS非依存）
│  │     ├─ CreateCollection.ts    … catalogId 検証 + 採番して作成（AWS非依存）
│  │     ├─ ListMarket.ts          … repo を呼んで成約ログ一覧を返す（AWS非依存）
│  │     ├─ ListMarketSummary.ts   … repo を呼んで相場サマリ一覧を返す（AWS非依存）
│  │     ├─ Create/Update/DeleteMarket.ts … 成約の作成・更新・削除（catalogId 検証）
│  │     ├─ ListCatalog.ts         … repo を呼んでカタログ一覧を返す（AWS非依存）
│  │     └─ Create/Update/DeleteCatalog.ts … カタログの作成・更新・削除
│  │
│  ├─ adapters/                    … 内と外の変換層
│  │  ├─ http/                     … 入力アダプタ（API Gateway 側）
│  │  │  ├─ httpResponse.ts        … json() / noContent() ヘルパー
│  │  │  ├─ extractUserId.ts       … event の JWT claims から sub を取り出す
│  │  │  ├─ extractGroups.ts       … event の JWT claims から cognito:groups を取り出す
│  │  │  ├─ requireEditor.ts       … editor グループ未所属なら 403（編集系の業務認可）
│  │  │  ├─ readJsonBody.ts        … event.body(base64可) を JSON として読む共通処理
│  │  │  ├─ parseNewCollection.ts  … POST 本文の検証・既定値補完（→ CreateCollectionInput）
│  │  │  ├─ parseCatalogInput.ts   … catalog 本文の検証・既定値補完（→ CatalogInput）
│  │  │  ├─ parseMarketInput.ts    … market 本文の検証（price/soldAt）→ MarketInput
│  │  │  ├─ CollectionController.ts … list（GET）/ create（POST）→ usecase → HTTP応答
│  │  │  ├─ MarketController.ts     … list/summary/create/update/remove → usecase → HTTP応答
│  │  │  ├─ CatalogController.ts    … list/create/update/remove → usecase → HTTP応答
│  │  │  └─ router.ts              … routeKey → controller のディスパッチ
│  │  └─ persistence/dynamo/       … 出力アダプタ（DynamoDB 側）
│  │     ├─ dynamoClient.ts        … DocumentClient 生成
│  │     ├─ collectionRecordMapper.ts … {PK,SK,data}⇄保存形。読みは buildCollectionItem に委譲
│  │     ├─ DynamoCollectionRepository.ts … CollectionRepository の実装（Catalog を join）
│  │     ├─ marketSaleMapper.ts    … テーブル行 + Catalog → MarketSale / MarketSummary
│  │     ├─ queryMarketSales.ts    … 成約行の全件取得・catalogId グルーピング・月変換の共有ヘルパー
│  │     ├─ DynamoMarketRepository.ts … MarketRepository の実装（読み: byNew GSI/join、書き: Put/Update/Delete）
│  │     ├─ DynamoMarketSummaryRepository.ts … 成約ログを catalog 単位に集計（summarizeSales + Catalog join）
│  │     ├─ catalogRecordMapper.ts … {PK,SK,data} ⇄ Catalog（PK=CATALOG / SK=CATALOG#<id>）
│  │     ├─ DynamoCatalogRepository.ts … CatalogRepository の実装（読み: BatchGet/Query、書き: Put/Delete）
│  │     └─ DynamoMarketPriceRepository.ts … catalogId→現在相場（成約ログを summarizeSales で集計）
│  │
│  ├─ config/
│  │  └─ env.ts                    … 環境変数(APP_TABLE_NAME / MARKET_TABLE_NAME)の読み取りを一元化
│  │
│  └─ handler.ts                   … 合成ルート：依存を組み立てて router へ
│
├─ dist/index.mjs                  … esbuild の出力（デプロイ時に zip。gitignore）
├─ package.json / tsconfig.json / esbuild.config.mjs
```

## 各層の責務

| 層 | 役割 | 依存してよい先 | 例 |
|----|------|----------------|-----|
| `domain` | 業務の型・ルール。フレームワーク非依存 | （なし） | `CollectionItem` |
| `application` | ユースケースと出力ポート(interface) | `domain` | `ListCollection`, `CollectionRepository` |
| `adapters` | 外部技術との変換・実装 | `application`, `domain` | `CollectionController`, `DynamoCollectionRepository` |
| `handler` | 合成ルート（依存の組み立て） | すべて | `handler.ts` |

> **ポート（port）** = `application` が定義する interface（`CollectionRepository`）。
> その**実装（adapter）** は `adapters/persistence` 側に置く。
> ユースケースは interface だけに依存し、DynamoDB を知らない（依存性逆転）。

## リクエストの流れ（`GET /collection`）

1. `handler.ts`（合成ルート）が `DynamoCollectionRepository` を生成して
   `ListCollection` に注入し、`router` に渡す（コールドスタート時に1度だけ）。
2. `router` が `routeKey` を見て `CollectionController.list` を呼ぶ。
3. `CollectionController` が `extractUserId(event)` で JWT の `sub` を取得（無ければ 401）。
4. `ListCollection.execute(userId)` を実行（純粋なビジネス処理）。
5. usecase は `CollectionRepository.listByUser` を呼ぶ。実装が DynamoDB を Query し、
   `collectionRecordMapper` が `{PK,SK,data}` → `CollectionItem[]` に変換。
6. Controller が結果を `httpResponse.json(200, items)` で HTTP に変換して返す。

DynamoDB 依存は `DynamoCollectionRepository` と `collectionRecordMapper` の
2ファイルだけに閉じ込められている。

## リクエストの流れ（`GET /market`）

コレクションとほぼ同じだが、マーケットは**全ユーザー共通（グローバル）**のため
`userId` を使わない点が異なる。

1. `handler.ts` が `DynamoMarketRepository`（独立テーブル `market-record`）を生成して
   `ListMarket` に注入し、`router` に渡す。
2. `router` が `GET /market` を `MarketController.list` に振り分ける。
   認証は API Gateway の Cognito Authorizer がルート手前で済ませている。
3. `ListMarket.execute()` を実行（引数なし）。
4. usecase は `MarketRepository.listAll` を呼ぶ。実装が `byNew` GSI を
   `gsiPk="RECORD"` で Query し、`marketSaleMapper` が各行 → `MarketSale[]` に変換。
5. Controller が結果を `httpResponse.json(200, records)` で返す。

並び順（新着/値上がり等）はフロント側で行うため、サーバーは生の配列を返す。
`Condition` / `ConditionFlags` は `domain/collection` の型を再利用している。

## Catalog マスタ（書誌の正規化 hub）

`CollectionEntry` と `MarketSale` は、以前は書誌情報
（`title` / `author` / `publisher` / `volume` / `year` / `flags` / `imageUrl`）を
各レコードに重複して持っていた。これを **Catalog** マスタへ正規化し、各レコードは
`catalogId` で参照するだけにした。新規 CollectionEntry / MarketSale を作る際は、
Catalog である程度「型」が決まっているので、固有情報だけ足せばよい。

| 種別 | 役割 | 主な固有属性 |
|------|------|--------------|
| `Catalog` | 書誌のマスタ（型・hub） | title / author / publisher / volume / year / flags / imageUrl |
| `CollectionEntry` | 所有インスタンス | catalogId + condition / qty / cost / 購入情報 / memo |
| `MarketSale` | 成約（取引ログ） | catalogId + condition / price / soldAt / seller / listedAt |

保存形（`app` 単一テーブル・アイテムコレクション型）: `PK="CATALOG"`（固定）,
`SK="CATALOG#<id>"`, `data={書誌}`。全 Catalog が単一パーティション `PK="CATALOG"` に
束ねられるので、PK を Query すれば全件取得・SK 指定で個別取得できる。

**API 応答は正規化前と同一**（破壊的変更なし）。`DynamoCollectionRepository` /
`DynamoMarketRepository` が一覧取得時に参照 `catalogId` を集め、
`CatalogRepository.getMany`（`BatchGetItem`）で一括取得して**サーバ側で join** し、
従来どおり書誌入りの `CollectionItem` / `MarketSale` を組み立てて返す。
参照先 Catalog が無い行は空プレースホルダ（`emptyCatalog`）で contract を満たす。

> Catalog 一覧の読み取りは `GET /catalogs`（`PK="CATALOG"` の Query で全件取得・
> `ListCatalog` → `CatalogRepository.listAll`）で提供する。
> Catalog / MarketSale の編集（`POST` / `PUT` / `DELETE`）は実装済み（次々節参照）。

## 書き込み系の追加例（`POST /collection`）

最初の書き込みエンドポイント。読み取りと同じ層構造に沿って次の順で足した。
今後の `update` / `delete` も同じ流れで拡張できる。

1. ポート `CollectionRepository` に `create(userId, id, catalogId, instance)` を追加。
2. `DynamoCollectionRepository.create` で `PutItem`（`attribute_not_exists(PK)` で上書き防止）。
3. ユースケース `CreateCollection`：`catalogId` の実在を `CatalogRepository` で検証し、
   `id`（uuid）と `updatedAt` を注入関数で採番、保存して enriched な `CollectionItem` を返す。
4. 入力の検証・既定値補完は `adapters/http/parseNewCollection.ts` に分離（純粋・テスト容易）。
5. `CollectionController.create` で `parse → usecase → 201/400` に変換、`router.ts` に
   `POST /collection` を追加。
6. API Gateway 側のルート（`terraform/apigateway.tf` の `locals.routes`）を追加。
   IAM は `PutItem` が既に許可済みのため追加不要。

`id` / 時刻はハンドラから注入する（`() => randomUUID()` / `() => Date.now()`）ので、
ユースケースは決定的にテストできる。書誌×固有×相場の合成は `buildCollectionItem`
（ドメインの純粋関数）を読み取り・作成で共用する。

> **現在相場（market）は Collection に保存しない。** 所有者が入力する値ではなく、
> その `catalogId` のマーケット相場（`market-record`）から導出すべきものなので、
> `POST /collection` の入力にも保存形にも含めない。読み取り（`GET /collection`）と
> 作成応答の両方で `MarketPriceRepository.pricesByCatalog` から相場を引き、
> 相場あり→`market`=価格 /`marketSource`=`auto`、相場なし→`0` /`estimate` を合成する。

## Market / Catalog の編集系（要 editor 権限）

`market` と `catalog` に作成・更新・削除を追加した。`POST /collection` と同じ層構造
（parse → usecase → repository）に沿い、さらに **業務認可** を一段重ねている。

| メソッド / パス | usecase | 主な応答 |
|-----------------|---------|----------|
| `POST /catalogs` | `CreateCatalog` | 201（id は `cat-<uuid>` 採番） |
| `PUT /catalogs/{id}` | `UpdateCatalog` | 200 / 404 |
| `DELETE /catalogs/{id}` | `DeleteCatalog` | 204 / 404 |
| `POST /market` | `CreateMarket` | 201（id/listedAt 採番） |
| `PUT /market/{id}` | `UpdateMarket` | 200 / 400 / 404 |
| `DELETE /market/{id}` | `DeleteMarket` | 204 / 404 |

### 認可（二段構え）

1. **認証（ログイン済みか）** … API Gateway の Cognito JWT Authorizer がルート手前で検証。
   無効／無トークンは Lambda に届く前に **401**。
2. **業務認可（編集権限があるか）** … 各書き込み Controller の先頭で `requireEditor(event)`
   を呼び、JWT の `cognito:groups`（`extractGroups` で取得。HTTP API は `"[editor]"` の
   文字列でも来るため両形式を吸収）に `editor` が無ければ **403**。グループは Cognito 側で
   管理し（`terraform/cognito.tf` の `aws_cognito_user_group.editor`）、ユーザーを入れると
   次回発行のトークンから `cognito:groups=editor` が載る。

読み取り系（`GET /market` `GET /market/summary` `GET /catalogs`）は業務認可を掛けず、
ログイン済みなら誰でも閲覧可。

### MarketSale（成約ログ）と MarketSummary（相場サマリ）の2層

マーケットは **成約1件1価格の取引ログ（`MarketSale`）** を append-only に貯め、
**相場（現在価格・変化率・チャート系列）は catalog 単位で集計する読み取りモデル
（`MarketSummary`）** として都度導出する（保存しない）。取引が疎な初版でも成約時点だけを
正直に記録できる。設計の詳細は [market-sales-redesign.md](market-sales-redesign.md)。

保存は正規化済み（書誌は `catalogId` 参照）。書き込み入力は `catalogId` ＋ 成約固有
（`condition` / `price` / `soldAt` / `seller`）だけを受け取り、次をサーバが決める:

- `id` = `mk-<uuid>`、`listedAt` = 登録時刻（byNew の新着ソート用。成約日 `soldAt` とは別軸）。
- `update` は `UpdateItem` で可変項目のみ置換して `listedAt` を保持
  （`condition` は DynamoDB 予約語なので名前プレースホルダで逃がす）。

`GET /market/summary` は成約ログを `catalogId` でグルーピングし、`domain/market/summarizeSales`
（純粋関数）で `price`（= 月次擬似 `history` の末尾）/ `change` / `history[12]` / `sampleCount`
/ `lastSoldAt` を導出する。成約が無い月は前方フィル、最初の成約より前はバックフィルして
月次折れ線を成立させる。`DynamoMarketPriceRepository`（Collection の相場 join）も同じ集計を
共有し `price` だけを取り出す。

読み取り応答は Catalog を join した形（`GET /market`=`MarketSale`、`GET /market/summary`=`MarketSummary`）。
`create` / `update` は `catalogId` の実在を検証し、不在なら **400**（`update` の対象 id
不在は **404**）。存在制御は DynamoDB の `attribute_exists` / `attribute_not_exists` で行う
（`ConditionalCheckFailedException` を 404/false に変換）。削除成功は本文なしの **204**。

> IAM は `PutItem` / `UpdateItem` / `DeleteItem` が既に許可済みのため追加不要。
> API Gateway 側は `terraform/apigateway.tf` の `locals.routes` に6ルートを足すだけで
> JWT Authorizer が自動付与される（`for_each`）。CORS も `PUT`/`DELETE` は許可済み。

## ビルド / デプロイ

- esbuild で `src/handler.ts` → `dist/index.mjs` に1ファイルバンドル。
  AWS SDK v3 は nodejs22.x runtime に同梱されているため `external` で同梱しない。
- `terraform` の `archive_file` は `lambda/dist` を zip する。
- `scripts/deploy.ps1` が apply 前に `npm run build` を自動実行する。

```powershell
# 手動でビルド・型チェックする場合
cd lambda
npm install      # 初回のみ
npm run typecheck
npm run build    # dist/index.mjs を生成
```

## テスト容易性

- `ListCollection` は `CollectionRepository` のモックを渡すだけで DB 無しに単体テスト可能。
- `collectionRecordMapper` は純粋関数なので入出力テストが簡単。
- `extractUserId` も event 形だけ与えればテストできる。

## 関連ドキュメント

- API 仕様: [openapi.yaml](openapi.yaml)
- コマンド早見表・データ投入: [commands.md](commands.md)
