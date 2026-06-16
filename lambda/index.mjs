// Lambda handler for the comics CRUD API.
// AWS SDK v3 is bundled in the nodejs22.x runtime, so no npm install is needed.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;
// 単一テーブル app（User / Collection / Price を同居）。
const APP_TABLE = process.env.APP_TABLE_NAME;

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

// app テーブルの Collection レコードを API レスポンス（CollectionItem）に変換する。
// 保存形は { PK:"USER#<sub>", SK:"COLLECTION#<id>", data:{...CollectionItem(id 以外)} }。
// id は SK から "COLLECTION#" を外して取り出し、残りは data をそのまま展開する。
const COLLECTION_PREFIX = "COLLECTION#";
const toCollectionItem = (rec) => ({
  id: rec.SK.slice(COLLECTION_PREFIX.length),
  ...rec.data,
});

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

        // app テーブルから PK="USER#<sub>" かつ SK が "COLLECTION#" で始まる
        // Collection レコードだけを取得する（PROFILE 等は除外される）。
        const res = await ddb.send(
          new QueryCommand({
            TableName: APP_TABLE,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues: {
              ":pk": `USER#${userId}`,
              ":sk": COLLECTION_PREFIX,
            },
          }),
        );
        return json(200, (res.Items ?? []).map(toCollectionItem));
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
