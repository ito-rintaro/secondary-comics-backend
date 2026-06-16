# フロントエンド実装ガイド（React.js Web）

このバックエンドを React.js の Web アプリから使うために、フロント側で何をすべきかをまとめる。

## フロントの責務（全体像）

```
[React アプリ]
  1. Cognito でサインイン        → IDトークン(JWT)を受け取る
  2. トークンを保持・自動更新     → ライブラリが面倒を見る
  3. API 呼び出し時にヘッダ付与   → Authorization: Bearer <IDトークン>
  4. 401 が返ったら再ログインへ誘導
```

やることは大きく **「①ログインしてトークンを得る」「②そのトークンを付けて API を叩く」** の2つだけ。
トークンの検証は API Gateway 側が行うので、フロントは「正しいトークンを付ける」ことに集中すればよい。

### サインイン方式（バックエンド設定）

User Pool は **メールアドレスをユーザー名として使う**設定（`username_attributes = ["email"]`）。
セルフサインアップ可・サインアップ時にメール確認コードが届く（`auto_verified_attributes = ["email"]`、送信は Cognito 標準）。

→ フロントの `loginMechanisms: ['email']` と一致する。`<Authenticator>` はそのまま「メールでサインイン／サインアップ」で動く。

---

## 必要な設定値

バックエンドの `terraform output` で取得できる値をフロントの環境変数に入れる。
**バックエンドは dev / prod の環境ごとに値が異なる**ので、フロントも環境ごとに `.env` を分ける。

以下は **dev 環境**の現在値:

| 変数 | 値（dev・現在） | 用途 |
|------|-----------|------|
| User Pool ID | `ap-northeast-1_lvEOCAFnu` | Cognito 認証 |
| App Client ID | `2mpap5bool3cskl6uujogpm2n7` | Cognito 認証 |
| Region | `ap-northeast-1` | Cognito 認証 |
| API Base URL | `https://upu69qvm0e.execute-api.ap-northeast-1.amazonaws.com` | API 呼び出し |

> これらは変わりうるので、ハードコードせず環境変数（Vite なら `.env` の `VITE_*`）で管理する。
> prod の値はバックエンド側で `terraform workspace select prod && terraform output` で取得して共有する。

`.env` の例（Vite を想定 / dev）:

```
VITE_COGNITO_USER_POOL_ID=ap-northeast-1_lvEOCAFnu
VITE_COGNITO_CLIENT_ID=2mpap5bool3cskl6uujogpm2n7
VITE_AWS_REGION=ap-northeast-1
VITE_API_BASE_URL=https://upu69qvm0e.execute-api.ap-northeast-1.amazonaws.com
```

---

## ライブラリ選定

**AWS Amplify（`aws-amplify`）を推奨。** Cognito 連携・トークンの保存・自動更新までやってくれるので、自前実装より圧倒的に楽。
ログイン画面まで自動生成したいなら `@aws-amplify/ui-react` の `<Authenticator>` を併用する。

```bash
npm install aws-amplify @aws-amplify/ui-react
```

---

## 実装ステップ

### 1. Amplify の初期化（アプリ起動時に1回）

`src/amplify.ts` を作り、`main.tsx` で読み込む。

```ts
// src/amplify.ts
import { Amplify } from "aws-amplify";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
    },
  },
});
```

```ts
// src/main.tsx の先頭で読み込む
import "./amplify";
```

### 2. ログイン UI（一番簡単な方法）

`<Authenticator>` で囲むと、サインアップ/サインイン画面が自動で出る。
ログイン済みのときだけ中身（アプリ本体）が表示される。

```tsx
// src/App.tsx
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import ComicsPage from "./ComicsPage";

export default function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div>
          <p>ようこそ {user?.username} さん</p>
          <button onClick={signOut}>ログアウト</button>
          <ComicsPage />
        </div>
      )}
    </Authenticator>
  );
}
```

### 3. トークンを付けて API を呼ぶ

`fetchAuthSession()` で現在の IDトークンを取り出し、`Authorization` ヘッダに付ける。
共通の API クライアントを1つ作っておくと使い回せる。

```ts
// src/api.ts
import { fetchAuthSession } from "aws-amplify/auth";

const BASE = import.meta.env.VITE_API_BASE_URL;

async function authHeader() {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  return { Authorization: `Bearer ${token}` };
}

export async function listComics() {
  const res = await fetch(`${BASE}/comics`, { headers: await authHeader() });
  if (res.status === 401) throw new Error("未認証です。再ログインしてください。");
  return res.json();
}

// My コレクション取得（openapi.yaml の GET /collection に対応）。
// ログイン中ユーザーのコレクションを CollectionItem[] で返す。
// 現状バックエンドは DB 未実装で、全員に同じ固定データを返す（疎通確認用）。
export async function listCollection() {
  const res = await fetch(`${BASE}/collection`, { headers: await authHeader() });
  if (res.status === 401) throw new Error("未認証です。再ログインしてください。");
  return res.json();
}

export async function createComic(data: {
  title: string;
  author?: string;
  tags?: string[];
}) {
  const res = await fetch(`${BASE}/comics`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateComic(id: string, data: Record<string, unknown>) {
  const res = await fetch(`${BASE}/comics/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteComic(id: string) {
  const res = await fetch(`${BASE}/comics/${id}`, {
    method: "DELETE",
    headers: await authHeader(),
  });
  return res.json();
}
```

### 4. コンポーネントから使う

```tsx
// src/ComicsPage.tsx
import { useEffect, useState } from "react";
import { listComics, createComic } from "./api";

export default function ComicsPage() {
  const [comics, setComics] = useState<any[]>([]);

  async function reload() {
    const res = await listComics();
    setComics(res.value ?? res); // 一覧APIのレスポンス形に合わせる
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <div>
      <button onClick={() => createComic({ title: "新規作品" }).then(reload)}>
        追加
      </button>
      <ul>
        {comics.map((c) => (
          <li key={c.id}>{c.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

---

## バックエンド側の対応状況（対応済み）

ブラウザから呼ぶために必要な以下2点は、**バックエンド側で対応・デプロイ済み**。
フロントはこのまま実装を進めてよい。

### ① CORS の設定 ✅ 対応済み

ブラウザは別オリジンから API を呼ぶ前にプリフライト（OPTIONS）で許可を確認する。
HTTP API に CORS 設定を追加済み:

- 許可オリジン: `http://localhost:5173`（Vite 既定。本番ドメインは後述の手順で追加）
- 許可メソッド: `GET, POST, PUT, DELETE, OPTIONS`
- 許可ヘッダ: `authorization, content-type`

> 別のポートやドメインで開発・公開する場合は、`terraform/variables.tf` の
> `allowed_origins` にオリジンを追加して `terraform apply` する。

### ② Amplify 用の認証フロー（SRP） ✅ 対応済み

Amplify が既定で使う `USER_SRP_AUTH` を App Client に追加済み。
Amplify の標準のサインインがそのまま動く。

---

## 注意点

- **トークンの有効期限**: IDトークンは既定1時間。Amplify が裏でリフレッシュトークンを使って自動更新するので、基本は意識不要。`fetchAuthSession()` を呼ぶたびに有効なトークンが得られる。
- **トークンをコードに埋めない**: 認証情報やトークンはソースに書かない。Amplify がブラウザの安全なストレージで管理する。
- **本番のオリジン**: デプロイ後の本番ドメインも CORS の許可オリジンに追加する。
- **エラーハンドリング**: API が 401 を返したらセッション切れ。ログイン画面へ誘導する。
