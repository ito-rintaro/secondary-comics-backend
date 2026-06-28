import {
  QueryCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { CollectionItem } from "../../../domain/collection/CollectionItem";
import type { CollectionInstance } from "../../../domain/collection/buildCollectionItem";
import type { CollectionRepository } from "../../../application/ports/CollectionRepository";
import type { CatalogRepository } from "../../../application/ports/CatalogRepository";
import {
  COLLECTION_PREFIX,
  toCollectionItem,
  userPk,
  type CollectionRecord,
  type CollectionData,
} from "./collectionRecordMapper";
import { emptyCatalog } from "./catalogRecordMapper";

// 単一テーブル app から Collection を読む CollectionRepository の実装。
// PK="USER#<sub>" かつ SK が "COLLECTION#" で始まるレコードだけを取得する
// （COLLECTION# 以外は自然に除外される）。
// 書誌情報は Catalog マスタへ正規化済みのため、参照 catalogId を集めて
// CatalogRepository でまとめて引き、サーバ側で join して CollectionItem を組み立てる。
export class DynamoCollectionRepository implements CollectionRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly catalog: CatalogRepository,
  ) {}

  async listByUser(userId: string): Promise<CollectionItem[]> {
    const res = await this.ddb.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": userPk(userId),
          ":sk": COLLECTION_PREFIX,
        },
      }),
    );
    const records = (res.Items ?? []) as CollectionRecord[];
    const catalogMap = await this.catalog.getMany(
      records.map((r) => r.data.catalogId),
    );
    return records.map((rec) =>
      toCollectionItem(
        rec,
        catalogMap.get(rec.data.catalogId) ?? emptyCatalog(rec.data.catalogId),
      ),
    );
  }

  async create(
    userId: string,
    id: string,
    catalogId: string,
    instance: CollectionInstance,
  ): Promise<void> {
    const data: CollectionData = { catalogId, ...instance };
    await this.ddb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { PK: userPk(userId), SK: `${COLLECTION_PREFIX}${id}`, data },
        // 同一キーが既にあれば上書きせず失敗させる（採番衝突への保険）。
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
  }
}
