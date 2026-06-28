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
│  │  │  └─ MarketRecord.ts        … 相場1件。openapi.yaml の MarketRecord と一致
│  │  └─ catalog/
│  │     └─ Catalog.ts             … 書誌のマスタ（型）。Collection/Market が共通参照する hub
│  │
│  ├─ application/                 … ユースケースと「ポート」(interface)
│  │  ├─ ports/
│  │  │  ├─ CollectionRepository.ts … listByUser(userId) / create(userId, id, catalogId, instance)
│  │  │  ├─ MarketRepository.ts    … listAll(): Promise<MarketRecord[]>
│  │  │  ├─ MarketPriceRepository.ts … pricesByCatalog(ids): catalogId→現在相場（円）
│  │  │  └─ CatalogRepository.ts   … getMany(ids)（join 用）/ listAll()（一覧 用）
│  │  └─ usecases/
│  │     ├─ ListCollection.ts      … repo を呼んで一覧を返す（AWS非依存）
│  │     ├─ CreateCollection.ts    … catalogId 検証 + 採番して作成（AWS非依存）
│  │     ├─ ListMarket.ts          … repo を呼んで相場一覧を返す（AWS非依存）
│  │     └─ ListCatalog.ts         … repo を呼んでカタログ一覧を返す（AWS非依存）
│  │
│  ├─ adapters/                    … 内と外の変換層
│  │  ├─ http/                     … 入力アダプタ（API Gateway 側）
│  │  │  ├─ httpResponse.ts        … json() ヘルパー
│  │  │  ├─ extractUserId.ts       … event の JWT claims から sub を取り出す
│  │  │  ├─ parseNewCollection.ts  … POST 本文の検証・既定値補完（→ CreateCollectionInput）
│  │  │  ├─ CollectionController.ts … list（GET）/ create（POST）→ usecase → HTTP応答
│  │  │  ├─ MarketController.ts     … event → usecase → HTTP応答（userId 不要）
│  │  │  ├─ CatalogController.ts    … event → usecase → HTTP応答（userId 不要）
│  │  │  └─ router.ts              … routeKey → controller のディスパッチ
│  │  └─ persistence/dynamo/       … 出力アダプタ（DynamoDB 側）
│  │     ├─ dynamoClient.ts        … DocumentClient 生成
│  │     ├─ collectionRecordMapper.ts … {PK,SK,data}⇄保存形。読みは buildCollectionItem に委譲
│  │     ├─ DynamoCollectionRepository.ts … CollectionRepository の実装（Catalog を join）
│  │     ├─ marketRecordMapper.ts  … テーブル行 + Catalog → MarketRecord
│  │     ├─ DynamoMarketRepository.ts … MarketRepository の実装（byNew GSI / Catalog を join）
│  │     ├─ catalogRecordMapper.ts … {PK,SK,data} ⇄ Catalog（PK=CATALOG / SK=CATALOG#<id>）
│  │     ├─ DynamoCatalogRepository.ts … CatalogRepository の実装（BatchGetItem）
│  │     └─ DynamoMarketPriceRepository.ts … catalogId→現在相場（market-record を集計）
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
   `gsiPk="RECORD"` で Query し、`marketRecordMapper` が各行 → `MarketRecord[]` に変換。
5. Controller が結果を `httpResponse.json(200, records)` で返す。

並び順（新着/値上がり等）はフロント側で行うため、サーバーは生の配列を返す。
`Condition` / `ConditionFlags` は `domain/collection` の型を再利用している。

## Catalog マスタ（書誌の正規化 hub）

`CollectionEntry` と `MarketRecord` は、以前は書誌情報
（`title` / `author` / `publisher` / `volume` / `year` / `flags` / `imageUrl`）を
各レコードに重複して持っていた。これを **Catalog** マスタへ正規化し、各レコードは
`catalogId` で参照するだけにした。新規 CollectionEntry / MarketRecord を作る際は、
Catalog である程度「型」が決まっているので、固有情報だけ足せばよい。

| 種別 | 役割 | 主な固有属性 |
|------|------|--------------|
| `Catalog` | 書誌のマスタ（型・hub） | title / author / publisher / volume / year / flags / imageUrl |
| `CollectionEntry` | 所有インスタンス | catalogId + condition / qty / cost / 購入情報 / memo |
| `MarketRecord` | 出品 | catalogId + seller / price / history / change / listedAt |

保存形（`app` 単一テーブル・アイテムコレクション型）: `PK="CATALOG"`（固定）,
`SK="CATALOG#<id>"`, `data={書誌}`。全 Catalog が単一パーティション `PK="CATALOG"` に
束ねられるので、PK を Query すれば全件取得・SK 指定で個別取得できる。

**API 応答は正規化前と同一**（破壊的変更なし）。`DynamoCollectionRepository` /
`DynamoMarketRepository` が一覧取得時に参照 `catalogId` を集め、
`CatalogRepository.getMany`（`BatchGetItem`）で一括取得して**サーバ側で join** し、
従来どおり書誌入りの `CollectionItem` / `MarketRecord` を組み立てて返す。
参照先 Catalog が無い行は空プレースホルダ（`emptyCatalog`）で contract を満たす。

> Catalog 一覧の読み取りは `GET /catalogs`（`PK="CATALOG"` の Query で全件取得・
> `ListCatalog` → `CatalogRepository.listAll`）で提供する。
> Catalog / Collection を作成する write エンドポイント（`POST /catalogs` 等）は次フェーズ。

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
