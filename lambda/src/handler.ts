import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { loadEnv } from "./config/env";
import { createDocumentClient } from "./adapters/persistence/dynamo/dynamoClient";
import { DynamoCollectionRepository } from "./adapters/persistence/dynamo/DynamoCollectionRepository";
import { DynamoMarketRepository } from "./adapters/persistence/dynamo/DynamoMarketRepository";
import { DynamoCatalogRepository } from "./adapters/persistence/dynamo/DynamoCatalogRepository";
import { ListCollection } from "./application/usecases/ListCollection";
import { ListMarket } from "./application/usecases/ListMarket";
import { CollectionController } from "./adapters/http/CollectionController";
import { MarketController } from "./adapters/http/MarketController";
import { Router } from "./adapters/http/router";
import { json } from "./adapters/http/httpResponse";

// --- 合成ルート（composition root）---
// 依存をここで 1 度だけ組み立てる（コールドスタート時に実行される）。
// 各層は具体実装を知らず、ここだけが全体の配線を知る。
const env = loadEnv();
const ddb = createDocumentClient();
// Catalog マスタは app テーブルに同居。Collection / Market の書誌 join に使う。
const catalogRepo = new DynamoCatalogRepository(ddb, env.appTableName);
const collectionRepo = new DynamoCollectionRepository(
  ddb,
  env.appTableName,
  catalogRepo,
);
const listCollection = new ListCollection(collectionRepo);
const collectionController = new CollectionController(listCollection);
const marketRepo = new DynamoMarketRepository(
  ddb,
  env.marketTableName,
  catalogRepo,
);
const listMarket = new ListMarket(marketRepo);
const marketController = new MarketController(listMarket);
const router = new Router(collectionController, marketController);

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
