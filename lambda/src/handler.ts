import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { loadEnv } from "./config/env";
import { createDocumentClient } from "./adapters/persistence/dynamo/dynamoClient";
import { createS3Client } from "./adapters/persistence/s3/s3Client";
import { S3PresignedUploadStore } from "./adapters/persistence/s3/S3PresignedUploadStore";
import { DynamoCollectionRepository } from "./adapters/persistence/dynamo/DynamoCollectionRepository";
import { DynamoMarketRepository } from "./adapters/persistence/dynamo/DynamoMarketRepository";
import { DynamoCatalogRepository } from "./adapters/persistence/dynamo/DynamoCatalogRepository";
import { DynamoMarketPriceRepository } from "./adapters/persistence/dynamo/DynamoMarketPriceRepository";
import { randomUUID } from "node:crypto";
import { ListCollection } from "./application/usecases/ListCollection";
import { CreateCollection } from "./application/usecases/CreateCollection";
import { ListMarket } from "./application/usecases/ListMarket";
import { CreateMarket } from "./application/usecases/CreateMarket";
import { UpdateMarket } from "./application/usecases/UpdateMarket";
import { DeleteMarket } from "./application/usecases/DeleteMarket";
import { ListCatalog } from "./application/usecases/ListCatalog";
import { CreateCatalog } from "./application/usecases/CreateCatalog";
import { UpdateCatalog } from "./application/usecases/UpdateCatalog";
import { DeleteCatalog } from "./application/usecases/DeleteCatalog";
import { CreateUploadUrl } from "./application/usecases/CreateUploadUrl";
import { CollectionController } from "./adapters/http/CollectionController";
import { MarketController } from "./adapters/http/MarketController";
import { CatalogController } from "./adapters/http/CatalogController";
import { UploadController } from "./adapters/http/UploadController";
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
// 編集系: catalogId の実在検証(catalogRepo)を挟み、id/listedAt はここで採番する。
// price/change は保存側で history から導出する（入力には含めない）。
const createMarket = new CreateMarket(
  marketRepo,
  catalogRepo,
  () => `mk-${randomUUID()}`,
  () => Date.now(),
);
const updateMarket = new UpdateMarket(marketRepo, catalogRepo);
const deleteMarket = new DeleteMarket(marketRepo);
const marketController = new MarketController(
  listMarket,
  createMarket,
  updateMarket,
  deleteMarket,
);
// Catalog 一覧は catalogRepo を再利用（PK="CATALOG" の Query で全件取得）。
const listCatalog = new ListCatalog(catalogRepo);
// 編集系: id はここで採番する（"cat-<uuid>"）。
const createCatalog = new CreateCatalog(catalogRepo, () => `cat-${randomUUID()}`);
const updateCatalog = new UpdateCatalog(catalogRepo);
const deleteCatalog = new DeleteCatalog(catalogRepo);
const catalogController = new CatalogController(
  listCatalog,
  createCatalog,
  updateCatalog,
  deleteCatalog,
);
// 画像アップロード: assets バケットの images/ 配下への署名付き PUT URL を発行する。
// キーはここで採番（uuid + 拡張子は usecase 側）、署名の有効期限は 300 秒。
const uploadStore = new S3PresignedUploadStore(
  createS3Client(),
  env.assetsBucketName,
);
const createUploadUrl = new CreateUploadUrl(uploadStore, () => randomUUID(), 300);
const uploadController = new UploadController(createUploadUrl);
const router = new Router(
  collectionController,
  marketController,
  catalogController,
  uploadController,
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
