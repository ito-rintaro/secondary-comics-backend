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
