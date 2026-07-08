# マーケット構造の再設計メモ（取引ログ + 相場サマリの2層化）

マーケットのデータ構造を、**「出品1件に月次 `history[12]` を埋め込む」現行方式**から、
**「実際の成約を1件1価格で貯める取引ログ + それを catalog 単位で集計する相場サマリ」**
の2層へ移行するための設計メモ。取引が疎な初版などでも、成約が起きた時点だけを
正直に記録し、相場は集計側で導出する。

> ステータス: 設計中（未実装）。実装前にレビューし、§8 の未確定事項を確定させること。
> FE への指示は §7 にまとめている（データ構造が変わるため FE 改修が必須）。

## 1. 目的 / 背景

- **現状の不便**: [`MarketRecord`](../lambda/src/domain/market/MarketRecord.ts) は
  `history: number[]`（直近12ヶ月・末尾=現在価格）を各レコードに埋め込む。
  [`deriveMarketPrice`](../lambda/src/domain/market/deriveMarketPrice.ts) が
  「末尾=現在価格・先頭比で変化率」と定義するため、**その月に取引が無いと測れない**。
  漫画の初版は取引が疎で、この月次固定長モデルと構造的に相性が悪い。
- **方針**: マーケットレコードは **販売が行われた記録（成約）を1件1価格で蓄積**する
  append-only なログにする。相場（現在価格・変化率・チャート系列）は、そのログを
  **catalog 単位で集計する導出レイヤー**で計算する。

## 2. 決定事項（確定）

| 論点 | 決定 |
|---|---|
| 記録の対象 | **成約のみ**（出品中の提示価格は含めない） |
| レコードの grain | **1レコード = 1成約 = 1価格** |
| 相場サマリの集計単位 | **catalog 単位**（`condition` はイベントに保持し、後で条件別に切れる余地を残す） |
| 月内に複数成約があった時の代表値 | **平均**（四捨五入して整数円） |
| `soldAt` の粒度 | **日精度**（`"YYYY-MM-DD"`） |
| チャート表示 | **月次折れ線を維持**（サーバが成約ログから擬似 `history[12]` を再生成） |
| API 公開形 | **`GET /market` は維持**（返す形は成約イベント寄りに変わる）＋ **`GET /market/summary` を新設** |
| DynamoDB インデックス | **今回は変更しない**（当面は現行 `byNew` 全走査 → `catalogId` でグルーピング集計）。量が増えたら `byCatalog` GSI を別途検討 |
| 既存データ | **移行する**（seed + 既存レコードを成約イベント列へ展開） |

## 3. 2層アーキテクチャ

```
┌─ 層A: 取引ログ（append-only / 成約イベント） ───────────────┐
│  MarketSale = 1成約 = 1価格                                   │
│    id / catalogId / condition / price / soldAt / seller       │
│    書き込み: POST/PUT/DELETE /market（要 editor）             │
│    読み取り: GET /market（成約イベント一覧・書誌 join）        │
└──────────────────────────────────────────────────────────────┘
                    │ summarizeSales()  … domain 純粋関数
                    │ （catalogId でグルーピングして集計）
                    ▼
┌─ 層B: 相場サマリ（catalog 単位・都度導出） ──────────────────┐
│  MarketSummary                                               │
│    catalogId + 書誌 / price / change / history[12] /          │
│    sampleCount / lastSoldAt                                   │
│    読み取り: GET /market/summary（相場一覧・チャートの供給源） │
└──────────────────────────────────────────────────────────────┘
```

**層Bは今回 materialize しない**（保存はしない）。低volumeのうちは都度集計で十分整合的。
集計は `domain` の純粋関数 `summarizeSales` に閉じ込め、将来量が増えたら
materialized summary item に差し替え可能な形にしておく。既存の
[`DynamoMarketPriceRepository.pricesByCatalog`](../lambda/src/adapters/persistence/dynamo/DynamoMarketPriceRepository.ts)
（collection の相場 join で使用）も、この集計の `price` 部分に統合して重複を解消する。

## 4. データモデル

### 4.1 層A: `MarketSale`（成約イベント）

現行 `MarketRecord` から `history` / `change` を撤去し、**単一 `price` と実日付 `soldAt`** を加える。

```ts
// domain/market/MarketSale.ts（新）
export interface MarketSale {
  id: string;          // "mk-<uuid>"（現行踏襲）
  catalogId: string;   // 参照する Catalog
  condition: Condition;// この成約個体の状態（S/A/B/C）。集計は catalog 単位でも残す
  price: number;       // 成約価格（円・0以上整数）＝単一
  soldAt: string;      // 成約日 "YYYY-MM-DD"（集計・チャートの時間軸）
  seller: string;      // 販売元 / ショップ名（任意・空文字可）
}
```

**保存形（`market-record` テーブル行）** — キースキーマと GSI は現状維持（§2）:

```
{
  marketRecordId,   // hash key（現行のまま）＝ API の id
  catalogId,
  condition,
  price,            // 単一成約価格（意味が「現在価格」→「この成約の価格」に変わる）
  soldAt,           // "YYYY-MM-DD"（新規）
  seller,
  listedAt,         // 登録時刻（採番連番）。byNew の新着ソート用に維持
  gsiPk: "RECORD",  // byNew / byPrice GSI の束ね（現状維持）
  // history / change は廃止（行から削除）
}
```

> `listedAt`（レコード登録時刻）と `soldAt`（経済的な成約日）は別物として両方持つ。
> 新着ソートは `listedAt`（byNew GSI）で従来どおり。時系列集計は `soldAt` で行う。

### 4.2 層B: `MarketSummary`（相場サマリ／catalog 単位）

`GET /market/summary` が返す形。**旧 `MarketRecord` に近いフィールド名を保ち**、FE の
相場カード／チャート改修を最小化する（`price` / `change` / `history` を踏襲）。

```ts
// domain/market/MarketSummary.ts（新）
export interface MarketSummary {
  catalogId: string;
  // --- Catalog 由来（サーバ join。相場一覧カードの表示に必要） ---
  title: string; author: string; publisher: string;
  volume: string; flags: ConditionFlags; imageUrl: string;
  // --- 集計値（summarizeSales で導出） ---
  price: number;       // 現在価格 = history 末尾（直近月バケット）。旧 price と同義
  change: number;      // (history末尾 - history先頭) / 先頭（先頭0なら0）。旧 change と同義
  history: number[];   // 月次に畳んだ擬似系列（要素数12・末尾=当月）。折れ線用
  sampleCount: number; // 集計に使った成約点数（信頼度の目安。新規）
  lastSoldAt: string;  // 直近成約日 "YYYY-MM-DD"（新規）
}
```

> **catalog 単位なので `seller` / 個別 `condition` / listing 単位の `id` は持たない。**
> それらは層A（`GET /market`）側にある。相場カードで「出品者」を出していた場合は
> 表示元が変わる（§7 参照）。

### 4.3 集計ロジック `summarizeSales`（domain 純粋関数）

```ts
// domain/market/summarizeSales.ts（新）— deriveMarketPrice を置き換える
// 1 catalog 分の成約配列 → 相場統計。呼び出し側で catalogId ごとにグルーピングして渡す。
summarizeSales(sales: MarketSale[], nowYm: string /* "YYYY-MM" */): {
  price: number; change: number; history: number[]; sampleCount: number; lastSoldAt: string;
}
```

**擬似 `history[12]` の再生成ルール（月次折れ線維持のキモ）**:

1. `nowYm` を末尾に、直近12ヶ月の月バケット（古い→新しい）を作る。
2. 各月バケットの値:
   - その月に成約が**あれば** → **その月の成約価格の平均**（四捨五入・整数円）。
   - **無ければ** → **直前月の値をキャリー**（前方フィル）。
3. 最初の成約より前の月（先頭側の空バケット）→ **最初の非空バケット値でバックフィル**
   （0埋めは `change` を壊すため）。
4. `price = history[11]`（末尾）、`change = 先頭0 ? 0 : (history[11]-history[0])/history[0]`。
   → 旧 `deriveMarketPrice` の不変条件「price = history 末尾」を維持できる。
5. `lastSoldAt` = 最大 `soldAt`、`sampleCount` = 成約件数。
6. 成約が**0件**の catalog はサマリに含めない（`GET /market/summary` の結果から除外）。
   collection 側の相場 join も、価格が引けなければ従来どおり `estimate` / 0 とする。

## 5. API 設計

### 5.1 `GET /market` — 成約ログ一覧（形が変わる）

- 返却: `MarketSale[]`（書誌 join 済み。従来同様 Catalog を合成）。
- 各要素は **`price`（単一）/ `soldAt` / `condition` / `seller`** を持ち、
  **`history` / `change` は持たない**（← 破壊的変更）。
- 用途: 成約ログの一覧・監査・editor の編集対象一覧。

### 5.2 `GET /market/summary` — 相場サマリ一覧（新設）

- 返却: `MarketSummary[]`（成約が1件以上ある catalog のみ）。
- 用途: **相場一覧カード & チャートの供給源**（旧 `GET /market` の役割を引き継ぐ）。
- 認可: 読み取りなのでログイン済みなら誰でも可（`GET /market` と同様）。

### 5.3 `POST /market` — 成約1件の登録（入力が変わる）

```jsonc
// 旧: { catalogId, seller, condition, history:[12個] }
// 新:
{
  "catalogId": "cat-001",
  "condition": "A",
  "price": 18000,          // 単一・0以上整数
  "soldAt": "2026-07-05",  // "YYYY-MM-DD"
  "seller": "古書みなと"    // 任意
}
```

- サーバ採番: `id = "mk-<uuid>"`、`listedAt = 登録時刻`。
- `price` / `change` の導出は廃止（`price` は入力値そのもの）。
- `PUT /market/{id}` は同じ本文で可変項目（`catalogId`/`condition`/`price`/`soldAt`/`seller`）を置換。
- `DELETE /market/{id}` は現状どおり。

### 5.4 OpenAPI 改修

- `MarketRecord` スキーマ → `MarketSale`（`history`/`change` 削除、`price` 単一化、`soldAt` 追加）。
- `MarketSummary` スキーマを新設。
- `NewMarketInput` を単一成約入力へ変更（`history` 必須 → `price`/`soldAt` 必須）。
- `GET /market/summary` パスを追加。

## 6. バックエンド改修（このリポジトリ）

| 層 | 変更 |
|---|---|
| `domain` | **新**: `MarketSale` / `MarketSummary` / `summarizeSales`。**廃止**: `deriveMarketPrice`、旧 `MarketRecord` |
| `application/ports` | `MarketRepository`（入出力を `MarketSale` 化）／ 相場サマリ用ポート（`MarketSummaryRepository.listSummaries()` 追加 or `MarketPriceRepository` を `summarizeSales` 経由に統合） |
| `application/usecases` | **新**: `ListMarketSummary`。既存 `CreateMarket`/`UpdateMarket`/`ListMarket` を新モデルに追従 |
| `adapters/http` | `parseMarketInput`（`history[12]` 検証 → `price`/`soldAt` 検証）、`MarketController`（`summary` ハンドラ追加）、`router`（`GET /market/summary`） |
| `adapters/persistence/dynamo` | `marketRecordMapper`（`history`/`change` 除去・`soldAt` 追加）、`DynamoMarketRepository`（`deriveMarketPrice` 依存除去）、`DynamoMarketPriceRepository`（`summarizeSales` の `price` 部分に統合）、サマリ一覧の実装 |
| インフラ | `terraform/apigateway.tf` に `GET /market/summary` ルート追加（JWT Authorizer は for_each で自動付与）。**DynamoDB のキー/GSI 変更なし**（§2）。IAM 追加不要 |
| 移行 | §8.2 |

> `parseMarketInput` の `soldAt` 検証: `"YYYY-MM-DD"` 形式・実在日・未来日を弾くか等は §8。

## 7. フロント（FE）への指示

**取引データの構造が変わるため FE 改修が必須。** 影響は「相場の表示元」と「入力フォーム」。

### 7.1 相場一覧カード & 価格チャート — 供給源を差し替え

- **データ源を `GET /market` → `GET /market/summary` に変更する。**
- キーが **listing 単位 → catalog 単位**になる（1冊1カード）。
- `price` / `change` / `history` の**フィールド名と意味は据え置き**なので、
  カード価格表示・折れ線チャートのロジックはほぼ流用可能（型定義の差し替えのみ）。
- **無くなるフィールド**: `id`(listing) / `seller` / 個別 `condition`。
  → これらをカードに出していた場合は表示を落とすか、`GET /market`（成約ログ）から別途取得する。
- 新フィールド `sampleCount` / `lastSoldAt` を使うと「直近◯件の成約」「最終取引日」を出せる（任意）。

### 7.2 取引入力フォーム（editor）— 単一成約入力へ

- **旧**: `history`（12ヶ月ぶんの価格）を入力。
- **新**: 1回の成約を入力 → `{ catalogId, condition, price, soldAt, seller? }`。
  - `soldAt` は**日付ピッカー**（`"YYYY-MM-DD"`）。
  - `price` は単一の整数円。`history` 入力 UI は撤去。
- 「相場は成約を積み重ねて自動算出される」ので、フォームは**成約を1件ずつ足す**運用になる。

### 7.3 取引ログ表示（任意・新規）

- `GET /market` を成約イベント一覧（表）として表示できる（editor の登録済み成約の確認・編集導線）。

### 7.4 型定義 / モック

- FE の `domain/market/MarketRecord.ts` を **`MarketSale` + `MarketSummary`** に更新。
- モックモード（`VITE_USE_API=false`）の固定データも成約イベント列 + サマリ導出に合わせて更新。
- **collection の `market` / `marketSource` はサーバ導出のまま**（相場サマリの `price` を使う）。
  → collection 画面側の FE 影響は無い。

## 8. 論点の状況（確定 / 未確定）

### 確定済み（§2）
- 成約のみ / grain=1価格 / catalog 単位集計 / 月内平均 / `soldAt` 日精度 /
  月次折れ線維持 / `GET /market` 維持 + `/market/summary` 新設 / インデックス据え置き / 移行あり。

### 未確定（実装前に確定）

#### 8.1 集計・入力の細部
- **`soldAt` の検証**: 形式 `"YYYY-MM-DD"` / 実在日 / **未来日を許すか**（成約なので原則過去〜当日）。
- **`change` の窓**: 擬似 `history[12]` の先頭 vs 末尾（＝約12ヶ月比）で確定。別窓（3ヶ月等）が要るなら追加。
- **月内平均の丸め**: 四捨五入で整数円（確定）。加重（数量）等は考慮しない。
- **`price` ソート GSI（byPrice）**: 成約価格のソートになり相場ソートとしては半端。当面据え置き、
  相場順の並びはサマリ算出後にフロント/サーバでソート。

#### 8.2 データ移行
- **seed（[`scripts/seed/seed.mjs`](../scripts/seed/seed.mjs)）**: 各書籍について、12ヶ月に散らした
  **複数の成約イベント**を生成（毎月ではなく一部の月に1〜数件、`basePrice` 近傍で揺らす）。
  疎さを再現しつつサマリ・チャートが成立するデータにする。
- **既存レコードの移行**: 旧行の `history[12]` を **月次12点の成約イベントに展開**するのを推奨
  （各月の値・その月1日を `soldAt` に）。チャートの見た目が連続で保たれる。
  簡易にするなら「現在価格（末尾）1点だけ」を移す案もあるが、履歴が消える。
- 移行は**新旧スキーマが混在しない**ようにワンショットで実施（旧 `history` 行は削除 or 上書き）。

#### 8.3 段階的な進め方（案）
1. 本メモをレビューし §8.1 / §8.2 を確定。
2. `openapi.yaml` を先に更新（`MarketSale` / `MarketSummary` / `GET /market/summary` / 入力）＝契約を固定。
3. バックエンド: `domain`（`summarizeSales` 等）→ `adapters` → `router`/`apigateway.tf` の順で実装。
4. seed / 既存データ移行スクリプトを用意して dev で投入・集計を確認。
5. FE: 型と供給源（§7.1）を差し替え、入力フォーム（§7.2）を改修。dev で疎通確認。

## 9. 追記: 相場サマリの materialize 化（第2段）

初期実装は「読み取りのたびに成約ログを全件スキャンして集計」していた（§3 で materialize は
見送り）。成約が増えると読み取りが重くなるため、**書き込みを重く・読み取りを軽く**する方針で
サマリを materialize（事前計算）へ移行した。併せて **catalog 別の成約履歴を新しい順で引く
クエリ**を追加した。

### 9.1 決定事項（第2段）

| 論点 | 決定 |
|---|---|
| サマリ保存形 | **月次バケット**（`months{ym:{sum,count}}` + `lastSoldAt`）を保存し、`history[12]`/`price`/`change`/`sampleCount` は**読み取り時に現在月基準で組み立て**る（ローリング窓の月替わり陳腐化を回避） |
| 置き場所 | `app` テーブルに同居。`PK="MARKET_SUMMARY"` / `SK=<catalogId>` |
| ライフサイクル | **カタログ作成で空サマリ作成・削除でサマリ削除** |
| 保守 | **成約の追加/更新/削除**で該当月バケットを差分更新（`MarketSummaryStore`） |
| 整合性 | 対象サマリ 1 件を**強整合 GetItem → `version` 条件付き PutItem** で read-modify-write。GSI 反映遅延に左右されず**追加直後に必ず反映**。競合はリトライ |
| 取引履歴クエリ | **catalog 別・成約日 `soldAt` の新しい順**。`byCatalog` GSI（`catalogId`→`soldAt`）を逆順 Query。`GET /market?catalogId=<id>` |

### 9.2 実装の要点

- `domain/market/summarizeSales.ts` を分割:
  - `foldSalesToMonthly(sales)` … 成約列 → 月次バケット（時間非依存・保存する形）
  - `applyBucketDelta(buckets, obs, ±1)` … 成約1件の差分反映（書き込み時）
  - `buildStatsFromMonthly(buckets, nowYm)` … 月次バケット + 現在月 → `SaleStats`（読み取り時）
- `sampleCount` はバケットの件数総和から読み取り時に導出。`lastSoldAt` は日精度が
  バケットから復元できないため別持ちで、**追加時は max 更新／削除時はベストエフォート**
  （最新成約を消した場合のみ僅かにズレ得る。次の追加か再構築で自己修復）。
- サマリ item は書誌を持たず**統計のみ**。読み取り時に Catalog を join するので、
  **カタログ更新時にサマリを触らずに済む**。
- 読み取り（`GET /market/summary` / Collection 相場 join）は成約ログをスキャンせず、
  `PK="MARKET_SUMMARY"` の Query（または summary の BatchGet）＋ Catalog join だけ。
- 既存データの再構築・修復: `scripts/seed/rebuild-summaries.mjs`（成約を読み直して全 catalog の
  サマリを作り直す。偽データは入れない）。`seed.mjs` も成約からサマリを同時生成。

### 9.3 インフラ / 移行（第2段）

- `terraform/tables.tf`: `market-record` に `byCatalog` GSI（`catalogId`→`soldAt`）と
  `catalogId`/`soldAt` 属性を追加。IAM は既存の `GetItem`/`PutItem`/`Query` で足りる。
- 手順: `deploy.ps1`（build + apply）→ GSI 追加反映後に `node scripts/seed/rebuild-summaries.mjs`
  でサマリをバックフィル。

### 9.4 FE への影響（第2段）

- **APIの形は不変**（`GET /market/summary` = `MarketSummary[]`、`GET /market` = `MarketSale[]`）。
  materialize は内部最適化なので、§7 の FE 実装はそのままで良い。
- 追加機能として `GET /market?catalogId=<id>`（その本の成約を新しい順）が使えるようになった
  （個別本の相場推移・取引履歴ビュー向け。任意採用）。
