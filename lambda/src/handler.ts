import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { loadEnv } from "./config/env";
import { createDocumentClient } from "./adapters/persistence/dynamo/dynamoClient";
import { DynamoCollectionRepository } from "./adapters/persistence/dynamo/DynamoCollectionRepository";
import { DynamoMarketRepository } from "./adapters/persistence/dynamo/DynamoMarketRepository";
import { DynamoCatalogRepository } from "./adapters/persistence/dynamo/DynamoCatalogRepository";
import { DynamoMarketPriceRepository } from "./adapters/persistence/dynamo/DynamoMarketPriceRepository";
import { randomUUID } from "node:crypto";
import { ListCollection } from "./application/usecases/ListCollection";
import { CreateCollection } from "./application/usecases/CreateCollection";
import { ListMarket } from "./application/usecases/ListMarket";
import { ListCatalog } from "./application/usecases/ListCatalog";
import { CollectionController } from "./adapters/http/CollectionController";
import { MarketController } from "./adapters/http/MarketController";
import { CatalogController } from "./adapters/http/CatalogController";
import { Router } from "./adapters/http/router";
import { json } from "./adapters/http/httpResponse";

// --- 合成ルート（composition root）---
// 依存をここで 1 度だけ組み立てる（コールドスタート時に実行される）。
// 各層は具体実装を知らず、ここだけが全体の配線を知る。
const env = loadEnv();
const ddb = createDocumentClient();
// Catalog マスタは app テーブルに同居。Collection / Market の書誌 join に使う。
const catalogRepo = new DynamoCatalogRepository(ddb, env.appTableName);
// 現在相場は market-record から導出する（Collection は market を保存しない）。
const marketPriceRepo = new DynamoMarketPriceRepository(ddb, env.marketTableName);
const collectionRepo = new DynamoCollectionRepository(
  ddb,
  env.appTableName,
  catalogRepo,
  marketPriceRepo,
);
const listCollection = new ListCollection(collectionRepo);
// 作成系: catalogId の実在検証(catalogRepo)と現在相場の導出(marketPriceRepo)を使い、
// id/updatedAt はここで採番する。
const createCollection = new CreateCollection(
  collectionRepo,
  catalogRepo,
  marketPriceRepo,
  () => randomUUID(),
  () => Date.now(),
);
const collectionController = new CollectionController(
  listCollection,
  createCollection,
);
const marketRepo = new DynamoMarketRepository(
  ddb,
  env.marketTableName,
  catalogRepo,
);
const listMarket = new ListMarket(marketRepo);
const marketController = new MarketController(listMarket);
// Catalog 一覧は catalogRepo を再利用（PK="CATALOG" の Query で全件取得）。
const listCatalog = new ListCatalog(catalogRepo);
const catalogController = new CatalogController(listCatalog);
const router = new Router(
  collectionController,
  marketController,
  catalogController,
);

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
