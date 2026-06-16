import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { loadEnv } from "./config/env";
import { createDocumentClient } from "./adapters/persistence/dynamo/dynamoClient";
import { DynamoCollectionRepository } from "./adapters/persistence/dynamo/DynamoCollectionRepository";
import { ListCollection } from "./application/usecases/ListCollection";
import { CollectionController } from "./adapters/http/CollectionController";
import { Router } from "./adapters/http/router";
import { json } from "./adapters/http/httpResponse";

// --- 合成ルート（composition root）---
// 依存をここで 1 度だけ組み立てる（コールドスタート時に実行される）。
// 各層は具体実装を知らず、ここだけが全体の配線を知る。
const env = loadEnv();
const ddb = createDocumentClient();
const collectionRepo = new DynamoCollectionRepository(ddb, env.appTableName);
const listCollection = new ListCollection(collectionRepo);
const collectionController = new CollectionController(listCollection);
const router = new Router(collectionController);

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    return await router.handle(event);
  } catch (err) {
    console.error(err);
    return json(500, { message: "internal error" });
  }
};
