import {
  QueryCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { CollectionItem } from "../../../domain/collection/CollectionItem";
import type { CollectionRepository } from "../../../application/ports/CollectionRepository";
import {
  COLLECTION_PREFIX,
  toCollectionItem,
  userPk,
  type CollectionRecord,
} from "./collectionRecordMapper";

// 単一テーブル app から Collection を読む CollectionRepository の実装。
// PK="USER#<sub>" かつ SK が "COLLECTION#" で始まるレコードだけを取得する
// （PROFILE 等は自然に除外される）。
export class DynamoCollectionRepository implements CollectionRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
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
    return ((res.Items ?? []) as CollectionRecord[]).map(toCollectionItem);
  }
}
