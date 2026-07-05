# 画像アップロード機能 設計メモ（署名付き PUT 方式）

カタログの画像を、**S3 への手動アップロード＋ファイル名手入力**という現運用から、
**この Web 上でファイルを選んでアップロードする**方式へ置き換えるための設計メモ。
方式は「バックエンドが署名付き PUT URL を発行し、ブラウザが S3 に直接アップロードする」
（Presigned PUT）を採用する。

> ステータス: 設計中（未実装）。実装前にレビューし、§8 の未確定事項を確定させること。

## 1. 目的 / スコープ

- **目的**: カタログ編集画面から画像ファイルを選択してアップロードし、`imageUrl` を
  自動でセットできるようにする（手動 S3 アップロード＋ファイル名手入力を廃止）。
- **対象**: **カタログ編集フォームのみ**。マーケットの `imageUrl` は参照カタログから
  サーバが導出する設計のため、マーケット側にアップロード UI は不要。
- **スコープ外（当面）**: アップロード済み画像の一覧・置換管理、旧画像の削除（GC）。

## 2. 現状整理

- `Catalog.imageUrl` は **S3 オブジェクトキー（ファイル名のみ）**。例: `619333a5ab646_...jpg`
- 表示は [`src/lib/imageUrl.ts`](../src/lib/imageUrl.ts) が
  `CloudFront ドメイン + "/images/" + キー` を組み立てる（`VITE_IMAGE_BASE_URL`）。
  `data:` / `http(s):` で始まる値はそのまま通す。
- 画像の配信元 S3/CloudFront は **既存 web と共有**（admin が編集するキー＝既存 web が
  表示する画像資産と同一。spec §10）。→ **アップロード先は共有画像バケットの `images/` 配下**。
- 現 API（[`openapi.yaml`](./openapi.yaml)）に **アップロード用エンドポイントは無い**。
- バックエンドは Lambda + API Gateway(HTTP API) + Cognito(editor グループ)。

## 3. 方式の決定

**採用: 署名付き PUT（Presigned PUT）**

| 方式 | 判断 |
|---|---|
| **署名付き PUT** | ✅ 採用。画像バイトが Lambda/API GW を通らずサイズ制限を受けない。定番・安価・シンプル。 |
| 署名付き POST | 見送り（将来オプション）。サイズ/型を S3 側で強制できるが multipart 構築が必要。厳密制限が要るなら移行。 |
| API 経由(base64) | 見送り。API Gateway 10MB 制限・Lambda コスト。 |

- サイズ/拡張子/MIME は **クライアント検証**で担保（PUT では S3 側の厳密強制は不可）。
  厳密化が必要になったら署名付き POST に切替。
- editor 未所属はアップロード不可（発行エンドポイントで 403）。

## 4. 処理フロー

```
[カタログ編集] ファイル選択（クライアント検証: MIME / 拡張子 / サイズ上限）
   │ 1. POST /uploads { contentType }        （Cognito ID トークン, editor 認証）
   ▼
[Lambda] editor 検証 → contentType 検証 → キー生成 images/<uuid>.<ext>
         → getSignedUrl(PutObject, { ContentType })
   │ 2. 200 { key: "<uuid>.<ext>", uploadUrl, expiresIn }
   ▼
[ブラウザ] 3. PUT <uploadUrl>  body=画像バイト  Header: Content-Type=<contentType>
              （※署名時と同じ Content-Type を送ること）→ S3 images/ に保存
   │ 4. imageUrl = 返ってきた key を form にセット & プレビュー表示
   ▼
[保存] 5. 既存の POST/PUT /catalogs で imageUrl(key) を保存
```

- **キー対応**: S3 オブジェクトは `images/<uuid>.<ext>`、`imageUrl` に保存するのは
  `<uuid>.<ext>`（`images/` は表示側 [`imageUrl.ts`](../src/lib/imageUrl.ts) が前置するため付けない）。
- **原子性**: アップロードとカタログ保存は別ステップ。ユーザーがアップロード後に保存を
  キャンセルすると S3 に孤児オブジェクトが残る（§8 GC 参照）。

## 5. API 設計（新規エンドポイント）

`openapi.yaml` に以下を追記する想定。

```yaml
/uploads:
  post:
    operationId: createUploadUrl
    summary: 画像アップロード用の署名付き PUT URL を発行（要 editor 権限）
    description: |
      カタログ画像を S3 の images/ 配下に直接アップロードするための署名付き URL を返す。
      オブジェクトキーはサーバが採番する（クライアントのファイル名は使わない）。
      "editor" グループ所属が必須（未所属は 403）。
    tags: [upload]
    security:
      - cognito: []
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/NewUploadInput'
    responses:
      '200':
        description: 署名付き PUT URL と、保存すべき imageUrl キー
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UploadTicket'
      '400': { description: contentType 不正 / 未対応の型 }
      '401': { description: 未認証 }
      '403': { description: 権限なし（editor 未所属） }

# components.schemas 追記
NewUploadInput:
  type: object
  required: [contentType]
  properties:
    contentType:
      type: string
      enum: [image/jpeg, image/png, image/webp]
      description: アップロードするファイルの MIME タイプ

UploadTicket:
  type: object
  required: [key, uploadUrl, expiresIn]
  properties:
    key:
      type: string
      description: 保存すべき imageUrl（images/ を除いたファイル名のみ）
      example: 8f3c1e2a-...-a1.jpg
    uploadUrl:
      type: string
      description: この URL に画像バイトを PUT する（Content-Type を一致させる）
    expiresIn:
      type: integer
      description: URL の有効秒数
      example: 300
```

## 6. バックエンドに必要な改修（別リポジトリ想定）

1. **`POST /uploads` ハンドラ**
   - editor 検証（既存の group 判定を流用。未所属 403）。
   - `contentType` を許可リスト（`image/jpeg|png|webp`）で検証、拡張子を導出。
   - **キーはサーバ生成**（uuid + 拡張子）。クライアントのファイル名は使わない
     （パストラバーサル / 上書き事故防止）。
   - `getSignedUrl(new PutObjectCommand({ Bucket, Key: "images/"+key, ContentType }))`。
     有効期限は短め（例 300 秒）。
2. **IAM**: Lambda 実行ロールに **共有画像バケットの `images/*` への `s3:PutObject`** を付与。
3. **S3 CORS**: admin オリジン（dev/prod の CloudFront ドメイン）からの `PUT` を許可。
   ```json
   [{
     "AllowedOrigins": ["https://<admin-dev>", "https://<admin-prod>"],
     "AllowedMethods": ["PUT"],
     "AllowedHeaders": ["*"],
     "ExposeHeaders": ["ETag"],
     "MaxAgeSeconds": 3000
   }]
   ```
4. **OpenAPI 追記**（§5）。

## 7. フロントに必要な改修

- **アップロードサービス** `src/data/http/`（例 `HttpImageRepository` / `uploadImage.ts`）:
  署名取得（`POST /uploads`）→ `fetch(uploadUrl, { method: "PUT", headers: {"Content-Type"}, body: file })`
  → 成功で `key` を返す。既存の [`httpClient.ts`](../src/data/http/httpClient.ts) の認証は
  `/uploads` にのみ使い、S3 への PUT は署名付き URL なので認証ヘッダを付けない点に注意。
- **interface + DI**: `ImageRepository`（`upload(file): Promise<string /* key */>`）を定義し
  [`container.ts`](../src/config/container.ts) で Http / Local を切替。
- **カタログフォーム** [`CatalogForm.tsx`](../src/features/catalog/CatalogForm.tsx):
  ファイル入力 + アップロードボタン + プレビュー（`Thumbnail` 流用）+ クリアボタン。
  既存の imageUrl 手入力欄は撤去する（§7.1 確定）。`imageUrl` は state で保持しフォームには出さない。
- **クライアント検証**: MIME / 拡張子 / サイズ上限（例 10MB）。進捗・エラー表示。
- **モックモード（`VITE_USE_API=false`）**: S3 が無いので、`LocalImageRepository` は
  選択ファイルを **`data:` URL** として読み込み `imageUrl` に入れる。
  [`imageUrl.ts`](../src/lib/imageUrl.ts) が `data:` を素通しするため、バックエンド無しで
  プレビュー〜保存まで動作する。

### 7.1 FE 確定仕様

- **アップロードのタイミング: 明示的なアップロードボタン（確定）。**
  ファイル選択 → クライアント検証 → `URL.createObjectURL` でプレビュー → **「アップロード」
  ボタン**で §4 の 1〜4（署名取得 → S3 へ PUT → `key` セット）を実行。フォーム保存は
  従来通りカタログを保存するだけ。
- **手入力欄: 撤去（アップロード専用・確定）。** `imageUrl` のキー直接入力欄は廃止し、
  画像はアップロード or クリアでのみ変更する。`imageUrl` は state としては保持し、
  フォームには出さない。
- **編集時の表示**: 既存カタログは現在の `imageUrl`（キー）を
  [`Thumbnail`](../src/features/common/Thumbnail.tsx) でプレビュー表示。置換は再アップロード、
  削除は「画像をクリア」で `imageUrl` を空文字に戻す。未操作なら既存キーを保持。
- **プレビュー**: アップロード前は `URL.createObjectURL(file)`（unmount / 差し替え時に
  `revokeObjectURL`）、成功後は返却 `key` を `Thumbnail` で表示。mock は `data:` URL を
  `imageUrl` に保存。
- **進捗表示**: まず `fetch` + スピナーで簡素に。進捗バーが要るなら S3 への PUT を
  `XMLHttpRequest` にして `upload.onprogress` を使う（後から差し替え可能）。
- **検証（確定値）**: 許可 MIME = `image/jpeg` / `image/png` / `image/webp`、
  サイズ上限 = 10MB。署名取得の前にクライアントで検査する。

## 8. 論点の状況（確定 / 未確定）

### 確定済み
- **共有画像バケットへの書き込み: OK**（admin から書き込んで良いと確認済み）。
  ただし IAM は **`images/*` 配下限定の最小権限**とし、既存 web の他プレフィックスには触れない。
- **許可フォーマット: jpeg / png / webp のみ**（下記セキュリティ）。
- **CloudFront キャッシュ**: 新規キー＝新規 URL のため差し替えは即時反映（invalidation 不要）。

### セキュリティ上の注意（確定）
- **SVG / HTML は許可しない。** `image/svg+xml` はスクリプトを内包でき、画像は既存 web と
  **同一オリジンの CloudFront** で配信されるため、悪意ある SVG が **XSS** ベクタになりうる
  （editor 限定でも内部者リスクは残る）。ラスタ形式（jpeg/png/webp）のみに限定する。
- `contentType` はクライアント申告値。バックエンドは **allow-list で検証**し、その ContentType で
  署名する（実バイトの中身検証まではしない＝PUT の限界。SVG 排除で実害は小さい）。
- **オブジェクトキーはサーバ生成**（uuid）。クライアントのファイル名は使わない
  （パストラバーサル・上書き事故の防止）。

### FE 確定（§7.1）
- **アップロードのタイミング: 明示的なアップロードボタン。**
- **手入力欄: 撤去（アップロード専用）+ 画像クリアボタン。**
- **許可 MIME: jpeg / png / webp、サイズ上限: 10MB**（クライアント検証）。

### 未確定（主にバックエンド / インフラ・実装前に確定）
- **キー命名**: uuid 新規統一 or 既存形式（`<hex>_<hex>.jpg`）踏襲。→ uuid 推奨。
- **旧画像の GC**: 差し替え時に旧オブジェクトが孤児化。S3 ライフサイクル or 放置を決める。
- **S3 CORS / 署名有効期限 / IAM 最小権限**（§6）。
- **サイズの厳密強制**が要るなら署名付き POST へ移行（現状はクライアント検証で担保）。
- **モックモードの容量**: `data:` URL を localStorage に保存すると数 MB でクォータ超過の恐れ。
  mock は小さめのサイズ上限（例 2MB）にするか、dev 限定の制約と割り切る。

## 9. 段階的な進め方（案）

1. 本メモをレビューし §8 を確定。
2. `openapi.yaml` に `POST /uploads` を追記（フロント/バックの契約を先に固定）。
3. フロント: モックモード（`data:` URL）で UI（ファイル入力/プレビュー/検証）を先に実装。
4. バックエンド: `POST /uploads` + IAM + S3 CORS を実装。
5. フロント: Http 実装を差し込み、dev で実 S3 への疎通確認。
