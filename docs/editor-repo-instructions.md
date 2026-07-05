# 指示書：市場・カタログ データ編集ツール（新レポジトリ）

> この文書は **新しいフロントエンド用レポジトリ** を新規作成するための指示書です。
> 新レポジトリで作業する Claude Code / 開発者は、この指示書を起点に実装してください。
> データモデルは既存バックエンド [`secondary-comics-backend`] の
> `docs/openapi.yaml` および `lambda/src/domain/**` と **必ず一致** させること。

---

## 1. 目的・背景

- 既存の `secondary-comics-backend`（DynamoDB + Lambda + API Gateway）は、
  **参照系（GET）のみ** を提供している：
  - `GET /collection` … ログイン中ユーザーのコレクション
  - `GET /market` … マーケット相場（全ユーザー共通）
  - `GET /catalogs` … カタログ書誌マスタ（全ユーザー共通）
- **編集系（作成・更新・削除）の API はまだ存在しない。**
- 本レポジトリの目的は、**マーケット相場データ（MarketRecord）と
  カタログ書誌マスタ（Catalog）を編集する管理用 Web ツール** を作ること。
- API が未整備のため、**当面はモックデータ + localStorage で完結** させる。
  将来 Lambda 側に編集系 API が生えたら、データアクセス層だけを差し替えて接続する。

### この編集ツールが扱わないもの
- コレクション（CollectionItem）はユーザー個人資産であり、本ツールの対象外。
- 認証（Cognito ログイン）は当面不要。将来 API 接続時に付与する（§10）。

---

## 2. 成果物

- 静的 Web アプリ 1 本（ビルド成果物を **S3 に配置し CloudFront で配信**）。
  - 既存 Web と同じホスティング方式（S3 + CloudFront、API は Lambda に問い合わせ）に揃える。
- 画面：
  1. **カタログ管理**（Catalog の一覧 / 新規作成 / 編集 / 削除）
  2. **マーケット相場管理**（MarketRecord の一覧 / 新規作成 / 編集 / 削除）
- 初期データ（モックシード）を同梱し、編集結果は localStorage に永続化する。

---

## 3. 技術・ホスティング方針

| 項目 | 方針 |
|------|------|
| 配信 | ビルド後の静的ファイルを **S3 に置き CloudFront** で配信（既存 Web と同方式）|
| 言語 | **TypeScript**（既存バックエンドと統一。型を流用する）|
| ビルド | **Vite**（`vite build` の出力 `dist/` をそのまま S3 へ）を推奨。静的出力であればフレームワークは不問 |
| UI | 軽量に。フレームワーク（React 等）を使う場合も、**ビルド結果は静的 HTML/JS/CSS** に限定 |
| データ源 | 当面 **モック + localStorage**。API 呼び出しは `Repository` 抽象の裏に隠す（§7）|
| 画像 | `imageUrl` は **S3 オブジェクトキー（ファイル名のみ）**。表示時に `CloudFront ドメイン + "/images/"` を前置（既存仕様と同じ）|

> 重要：**データアクセスを直に `fetch`/`localStorage` で書かない**。必ず §7 の
> Repository インターフェース越しにアクセスすること。これにより
> 「モック → 実 API」の差し替えが 1 ファイルで済む。

---

## 4. ディレクトリ構成（例）

```
market-catalog-editor/
  index.html
  src/
    domain/                … 型定義（バックエンドと一致させる。§5）
      Condition.ts
      ConditionFlags.ts
      Catalog.ts
      MarketRecord.ts
    data/                  … データアクセス層（§7）
      CatalogRepository.ts       … interface
      MarketRepository.ts        … interface
      localStorage/
        LocalCatalogRepository.ts
        LocalMarketRepository.ts
      seed/
        catalogs.seed.ts
        markets.seed.ts
    features/
      catalog/             … カタログ一覧・フォーム
      market/              … 相場一覧・フォーム
    lib/
      marketDerive.ts      … price / change の導出（§8）
      imageUrl.ts          … CloudFront + /images/ 前置
    main.ts
  docs/
    README.md
  package.json
  vite.config.ts
```

---

## 5. データモデル（バックエンドと一致させること）

以下の型は **既存バックエンドからの写し**。フィールドの増減・改名は禁止。
（出典：`lambda/src/domain/**` および `docs/openapi.yaml`）

```typescript
// 状態ランク。S=新品・美品 / A=良い / B=並 / C=傷み・難あり
export type Condition = "S" | "A" | "B" | "C";

// 付帯状態フラグ
export interface ConditionFlags {
  firstEd: boolean;  // 初版か
  obi: boolean;      // 帯付きか
  special: boolean;  // 特装・サイン等の特別仕様か
}

// 書誌マスタ 1 件。Collection / MarketRecord が参照する hub。
export interface Catalog {
  id: string;            // カタログ識別子（"cat-001" 形式）
  title: string;         // 作品名
  author: string;        // 著者
  publisher: string;     // 出版社 / レーベル
  volume: string;        // 巻数（"全6巻" "第1巻" 等の自由文字列）
  year: string;          // 発行年（文字列）
  flags: ConditionFlags; // 付帯状態フラグ（初版/帯/特装）
  imageUrl: string;      // S3 オブジェクトキー（ファイル名のみ。空文字可）
}

// マーケット相場レコード 1 件（全ユーザー共通＝グローバル）。
export interface MarketRecord {
  id: string;            // レコード識別子（"mk0" 形式）
  title: string;         // 作品名
  author: string;        // 著者
  publisher: string;     // 出版社 / レーベル
  volume: string;        // 巻数
  seller: string;        // 出品者 / ショップ名
  condition: Condition;  // 状態ランク
  flags: ConditionFlags; // 付帯状態フラグ
  history: number[];     // 直近12ヶ月の価格推移（円）。要素数12・末尾が現在価格
  price: number;         // 現在価格（円）。history の末尾と一致
  change: number;        // 期間変化率 (末尾-先頭)/先頭。0.18 なら +18%
  listedAt: number;      // 新着ソート用の連番（大きいほど新しい）
  imageUrl: string;      // S3 オブジェクトキー（ファイル名のみ。空文字可）
}
```

> 補足：現状の `MarketRecord` は `title/author/publisher/volume` を **自前で保持**
> しており `catalogId` を持たない（バックエンドの現行定義に合わせる）。
> カタログを選んで書誌を prefill する UI 補助を付けるのは可（§9 の任意項目）が、
> **保存する型に `catalogId` を勝手に足さないこと**。

---

## 6. モックデータ（初期シード）

`docs/openapi.yaml` の `examples`（`CatalogList` / `MarketList`）を基に、
**各 8〜12 件程度** のシードを `src/data/seed/*.seed.ts` に用意する。要件：

- Catalog：`id` は `cat-001`, `cat-002`, … の連番。作品はバラけさせる
  （AKIRA / 鬼滅の刃 / ドラゴンボール など既存 example を含めてよい）。
- MarketRecord：`id` は `mk0`, `mk1`, …。`history` は必ず **12 要素**、
  `price` は `history` 末尾、`change` は `(末尾-先頭)/先頭`、
  `listedAt` は連番（新しいほど大）とする（§8 の導出を満たすこと）。
- `imageUrl` は空文字 `""` でよい（画像未配置でも動くこと）。

初回起動時、localStorage が空ならシードを流し込む（§7）。

---

## 7. データアクセス層（差し替え可能にする）

**目的**：モック（localStorage）→ 実 API（Lambda）を **1 実装の交換だけ** で
切り替えられるようにする。画面コードは interface にのみ依存する。

```typescript
// src/data/CatalogRepository.ts
export interface CatalogRepository {
  list(): Promise<Catalog[]>;
  get(id: string): Promise<Catalog | null>;
  create(input: Omit<Catalog, "id">): Promise<Catalog>; // id はリポジトリが採番
  update(id: string, patch: Partial<Omit<Catalog, "id">>): Promise<Catalog>;
  remove(id: string): Promise<void>;
}

// src/data/MarketRepository.ts
export interface MarketRepository {
  list(): Promise<MarketRecord[]>;
  get(id: string): Promise<MarketRecord | null>;
  create(input: Omit<MarketRecord, "id" | "price" | "change">): Promise<MarketRecord>;
  update(id: string, patch: Partial<Omit<MarketRecord, "id">>): Promise<MarketRecord>;
  remove(id: string): Promise<void>;
}
```

### localStorage 実装の要件
- キーは `editor:catalogs` / `editor:markets`（JSON 配列）。
- 起動時に未初期化ならシード（§6）を書き込む。
- `create` は id を採番（Catalog は `cat-XXX`、Market は `mk{n}`）。
- `MarketRepository` の `create`/`update` では、保存前に **price/change を再導出**（§8）。
- 全メソッドは `Promise` を返す（将来の `fetch` 実装と同じシグネチャにするため）。

> すべて非同期 API にしておくこと。将来 `LocalXxxRepository` を
> `HttpXxxRepository`（`fetch` 実装）に差し替えるだけで API 接続へ移行できる。

---

## 8. 相場レコードの導出ルール（必ず実装）

`MarketRecord` は入力の一部を **導出値** として計算する。UI から直接編集させない：

- `price` = `history[history.length - 1]`（history 末尾）
- `change` = `(末尾 - 先頭) / 先頭`（先頭が 0 のときは `0`）
- バリデーション：
  - `history` は **要素数ちょうど 12**、各要素は 0 以上の整数。
  - `history` が 12 要素でなければ保存不可（フォームでエラー表示）。

`src/lib/marketDerive.ts` にまとめ、シード生成・create・update から共用する。

---

## 9. 画面仕様

### 共通
- ナビゲーションで「カタログ」「マーケット」を切替。
- 一覧はテーブル or カード。**検索 / 並べ替えはクライアント側**（既存 API 方針と同じ）。
- 削除は確認ダイアログを挟む。
- 保存・削除後は一覧を再取得して反映。

### 9-1. カタログ管理（Catalog CRUD）
- 一覧：`title / author / publisher / volume / year / flags`、サムネイル（imageUrl）。
- フォーム項目：`title, author, publisher, volume, year, flags(firstEd/obi/special), imageUrl`。
  - `id` は作成時にリポジトリが採番（`cat-XXX`）。編集時は読み取り専用表示。
- バリデーション：`title` 必須。その他は空文字許容（既存仕様に準拠）。

### 9-2. マーケット相場管理（MarketRecord CRUD）
- 一覧：`title / seller / condition / price / change`、価格推移スパークライン（任意）。
  - `change` は符号で色分けすると見やすい（+緑 / −赤）。
- フォーム項目：`title, author, publisher, volume, seller, condition, flags, history(12点), imageUrl`。
  - `price` / `change` は **入力させず導出結果を表示**（§8）。
  - `listedAt` は作成時に自動採番（既存最大 +1）。
- バリデーション：`history` は 12 要素の 0 以上整数（§8）。`title` 必須。
- 任意補助：既存 Catalog を選んで `title/author/publisher/volume/imageUrl` を prefill
  するボタンを付けてよい（保存する型に `catalogId` は足さない）。

---

## 10. 画像・将来の API 連携

- `imageUrl` は **ファイル名（S3 オブジェクトキー）のみ** を保持。
  表示は `src/lib/imageUrl.ts` で `CloudFront ドメイン + "/images/" + imageUrl` を組み立てる。
  CloudFront ドメインは環境変数（`VITE_CDN_BASE` 等）で外出しし、未設定でも壊れないこと。
- 将来 Lambda に編集系 API（想定：`POST/PUT/DELETE /catalogs`, `POST/PUT/DELETE /market`）が
  生えたら、§7 の Repository を `fetch` 実装に差し替える。
  - レスポンス型は本ツールの `Catalog` / `MarketRecord` と一致させる。
  - 認証が必要になれば `Authorization: Bearer <JWT>` を付ける（既存 `docs/openapi.yaml` 準拠）。

---

## 11. 制約・非機能

- 既存バックエンドの型・命名・enum（`Condition`, `MarketSource` 等）から逸脱しない。
- 破壊的操作（削除・全消去）はワンクッション置く。
- localStorage が壊れた／古い形式でも、シードで復旧できるフォールバックを持つ。
- 依存は最小限（重量級の状態管理ライブラリは不要）。

---

## 12. 完了条件（Definition of Done）

- [ ] `npm run dev` で起動し、カタログ・マーケット両画面が動作する。
- [ ] Catalog を新規作成・編集・削除でき、リロード後も localStorage で保持される。
- [ ] MarketRecord を新規作成・編集・削除でき、`price`/`change` が §8 どおり導出される。
- [ ] `history` が 12 要素でない入力は保存できずエラー表示される。
- [ ] データアクセスがすべて `CatalogRepository` / `MarketRepository` 越しで、
      画面から直接 localStorage/fetch を触っていない。
- [ ] `vite build` の `dist/` が静的ファイルのみで、S3 に置けば配信できる。
- [ ] 型定義が `docs/openapi.yaml` / バックエンド `domain/**` と一致している。

---

## 13. 作業手順（新レポジトリ側 Claude Code への指示）

1. Vite + TypeScript でプロジェクト初期化（`market-catalog-editor`）。
2. §5 の型を `src/domain/` に作成（バックエンドからの写し）。
3. §7 の Repository インターフェースと localStorage 実装、§8 の導出ユーティリティを実装。
4. §6 のシードを用意し、初回起動で localStorage に投入。
5. §9 の 2 画面（Catalog CRUD / Market CRUD）を実装。
6. §10 の imageUrl 組み立て・CDN ベースの環境変数化。
7. §12 の DoD を上から順に満たし、`README.md` に起動・ビルド・S3 配置手順を記載。

> 参考にすべき既存ファイル（バックエンド側）：
> - `docs/openapi.yaml`（スキーマと example）
> - `lambda/src/domain/catalog/Catalog.ts`
> - `lambda/src/domain/market/MarketRecord.ts`
> - `lambda/src/domain/collection/{Condition,ConditionFlags}.ts`
