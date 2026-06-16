// Lambda handler for the comics CRUD API.
// AWS SDK v3 is bundled in the nodejs22.x runtime, so no npm install is needed.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

// ログイン中ユーザーの識別子を取り出す。
// API Gateway の JWT Authorizer が検証済みクレームを event に載せるので、
// その sub を使う。userId はリクエストから受け取らない（他人のデータを
// 指定できないようにするため。openapi.yaml の方針）。
const getUserId = (event) =>
  event.requestContext?.authorizer?.jwt?.claims?.sub ?? null;

// DB 実装前の疎通確認用のダミーデータ。
// 本来は Cognito の sub でユーザーごとに絞り込むが、今は誰がアクセスしても
// この同じ配列を返す（openapi.yaml の CollectionItem スキーマに準拠）。
const SAMPLE_COLLECTION = [
  {
    id: "seed0",
    title: "AKIRA 全6巻 初版帯付セット",
    author: "大友克洋",
    publisher: "講談社 / KCデラックス",
    volume: "全6巻",
    year: "1984",
    condition: "A",
    qty: 1,
    cost: 8000,
    market: 35000,
    marketSource: "manual",
    flags: { firstEd: true, obi: true, special: false },
    purchaseDate: "",
    store: "まんだらけ",
    location: "本棚A",
    memo: "初版・帯揃い。背ヤケ少なめ。",
    imageUrl: "",
    updatedAt: 1718000000000,
  },
  {
    id: "seed4",
    title: "鬼滅の刃 第1巻 初版",
    author: "吾峠呼世晴",
    publisher: "集英社 / ジャンプコミックス",
    volume: "第1巻",
    year: "2016",
    condition: "S",
    qty: 2,
    cost: 1500,
    market: 9000,
    marketSource: "manual",
    flags: { firstEd: true, obi: true, special: false },
    purchaseDate: "",
    store: "ヤフオク",
    location: "防湿庫",
    memo: "初版帯付き2冊保有。値上がり中。",
    imageUrl: "",
    updatedAt: 1718000004000,
  },
];

export const handler = async (event) => {
  const route = event.routeKey; // e.g. "GET /comics/{id}"
  const id = event.pathParameters?.id;

  let data = {};
  if (event.body) {
    try {
      data = JSON.parse(event.body);
    } catch {
      return json(400, { message: "Request body is not valid JSON" });
    }
  }

  try {
    switch (route) {
      case "GET /health": {
        // 認証不要のヘルスチェック。
        return json(200, { status: "ok" });
      }

      case "GET /collection": {
        // JWT の sub からユーザー識別子を取得する。
        // 通常は Authorizer が無効トークンを弾くのでここには来ないが、
        // 念のため sub が無ければ 401 を返す。
        const userId = getUserId(event);
        if (!userId) return json(401, { message: "Unauthorized" });

        // DB 未実装のため、今はどのユーザーでも同じ固定配列を返す（疎通確認用）。
        // userId は取得済みなので、DynamoDB 実装後はこの userId で
        // ユーザーのアイテムだけを Query して返すよう差し替える。
        console.log("listCollection for userId:", userId);
        return json(200, SAMPLE_COLLECTION);
      }

      case "GET /comics": {
        const res = await ddb.send(new ScanCommand({ TableName: TABLE }));
        return json(200, res.Items ?? []);
      }

      case "GET /comics/{id}": {
        const res = await ddb.send(
          new GetCommand({ TableName: TABLE, Key: { id } }),
        );
        if (!res.Item) return json(404, { message: `comic ${id} not found` });
        return json(200, res.Item);
      }

      case "POST /comics": {
        const now = new Date().toISOString();
        const item = {
          id: data.id ?? randomUUID(),
          title: data.title ?? "",
          author: data.author ?? "",
          circle: data.circle ?? "",
          tags: data.tags ?? [],
          createdAt: now,
          updatedAt: now,
        };
        await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
        return json(201, item);
      }

      case "PUT /comics/{id}": {
        const current = await ddb.send(
          new GetCommand({ TableName: TABLE, Key: { id } }),
        );
        if (!current.Item) return json(404, { message: `comic ${id} not found` });
        const item = {
          ...current.Item,
          ...data,
          id, // path id wins, body cannot change the key
          updatedAt: new Date().toISOString(),
        };
        await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
        return json(200, item);
      }

      case "DELETE /comics/{id}": {
        await ddb.send(
          new DeleteCommand({ TableName: TABLE, Key: { id } }),
        );
        return json(200, { message: "deleted", id });
      }

      default:
        return json(404, { message: `no route for ${route}` });
    }
  } catch (err) {
    console.error(err);
    return json(500, { message: "internal error", error: String(err) });
  }
};
