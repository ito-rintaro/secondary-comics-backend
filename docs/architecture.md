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
│  │  │  ├─ Condition.ts           … S/A/B/C（market と共有）
│  │  │  ├─ ConditionFlags.ts      … firstEd/obi/special（market と共有）
│  │  │  └─ MarketSource.ts        … manual/auto/estimate
│  │  ├─ market/
│  │  │  └─ MarketRecord.ts        … 相場1件。openapi.yaml の MarketRecord と一致
│  │  └─ product/
│  │     └─ Product.ts             … 書誌のマスタ（型）。Collection/Market が共通参照する hub
│  │
│  ├─ application/                 … ユースケースと「ポート」(interface)
│  │  ├─ ports/
│  │  │  ├─ CollectionRepository.ts … listByUser(userId): Promise<CollectionItem[]>
│  │  │  ├─ MarketRepository.ts    … listAll(): Promise<MarketRecord[]>
│  │  │  └─ ProductRepository.ts   … getMany(ids): Promise<Map<id, Product>>
│  │  └─ usecases/
│  │     ├─ ListCollection.ts      … repo を呼んで一覧を返す（AWS非依存）
│  │     └─ ListMarket.ts          … repo を呼んで相場一覧を返す（AWS非依存）
│  │
│  ├─ adapters/                    … 内と外の変換層
│  │  ├─ http/                     … 入力アダプタ（API Gateway 側）
│  │  │  ├─ httpResponse.ts        … json() ヘルパー
│  │  │  ├─ extractUserId.ts       … event の JWT claims から sub を取り出す
│  │  │  ├─ CollectionController.ts … event → usecase → HTTP応答
│  │  │  ├─ MarketController.ts     … event → usecase → HTTP応答（userId 不要）
│  │  │  └─ router.ts              … routeKey → controller のディスパッチ
│  │  └─ persistence/dynamo/       … 出力アダプタ（DynamoDB 側）
│  │     ├─ dynamoClient.ts        … DocumentClient 生成
│  │     ├─ collectionRecordMapper.ts … {PK,SK,data} + Product → CollectionItem
│  │     ├─ DynamoCollectionRepository.ts … CollectionRepository の実装（Product を join）
│  │     ├─ marketRecordMapper.ts  … テーブル行 + Product → MarketRecord
│  │     ├─ DynamoMarketRepository.ts … MarketRepository の実装（byNew GSI / Product を join）
│  │     ├─ productRecordMapper.ts … {PK,SK,data} ⇄ Product（PRODUCT#<id>/META）
│  │     └─ DynamoProductRepository.ts … ProductRepository の実装（BatchGetItem）
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

## Product マスタ（書誌の正規化 hub）

`CollectionEntry` と `MarketRecord` は、以前は書誌情報
（`title` / `author` / `publisher` / `volume` / `year` / `flags` / `imageUrl`）を
各レコードに重複して持っていた。これを **Product** マスタへ正規化し、各レコードは
`productId` で参照するだけにした。新規 CollectionEntry / MarketRecord を作る際は、
Product である程度「型」が決まっているので、固有情報だけ足せばよい。

| 種別 | 役割 | 主な固有属性 |
|------|------|--------------|
| `Product` | 書誌のマスタ（型・hub） | title / author / publisher / volume / year / flags / imageUrl |
| `CollectionEntry` | 所有インスタンス | productId + condition / qty / cost / 購入情報 / memo |
| `MarketRecord` | 出品 | productId + seller / price / history / change / listedAt |

保存形（`app` 単一テーブル）: `PK="PRODUCT#<id>"`, `SK="META"`, `data={書誌}`。

**API 応答は正規化前と同一**（破壊的変更なし）。`DynamoCollectionRepository` /
`DynamoMarketRepository` が一覧取得時に参照 `productId` を集め、
`ProductRepository.getMany`（`BatchGetItem`）で一括取得して**サーバ側で join** し、
従来どおり書誌入りの `CollectionItem` / `MarketRecord` を組み立てて返す。
参照先 Product が無い行は空プレースホルダ（`emptyProduct`）で contract を満たす。

> このフェーズは正規化基盤と読み取り（join）まで。Product / Collection を作成する
> write エンドポイント（`POST /products` 等）は次フェーズで追加する。

## 拡張のしかた（将来の save / delete）

1. `application/ports/CollectionRepository.ts` にメソッドを追加
   （例: `save(userId, item)` / `delete(userId, id)`）。
2. `DynamoCollectionRepository` にその実装を足す。
3. `application/usecases/` に `SaveCollectionItem` などのユースケースを追加。
4. `adapters/http/CollectionController.ts` にハンドラを足し、`router.ts` に
   ルート（`POST /collection` 等）を追加。
5. API Gateway 側のルート（`terraform/apigateway.tf` の `locals.routes`）と、
   必要な IAM 権限（`terraform/lambda.tf`）を追加。

ドメインの型（`CollectionItem`）と保存形（`app` テーブルのキー設計）は
そのまま流用できる。

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
