import {
  BatchGetCommand,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { Catalog } from "../../../domain/catalog/Catalog";
import type {
  CatalogInput,
  CatalogRepository,
} from "../../../application/ports/CatalogRepository";
import {
  CATALOG_PK,
  catalogSk,
  toCatalog,
  type CatalogRecord,
} from "./catalogRecordMapper";

// 単一テーブル app から Catalog マスタを読み書きする CatalogRepository の実装。
// 一覧取得で集めた catalogId 群を BatchGetItem でまとめて引く（N+1 を避ける）。
// BatchGetItem は 1 回あたり 100 キーまでのため 100 件ずつに分割する。
const BATCH_LIMIT = 100;

// 存在制御（attribute_not_exists / attribute_exists）に失敗したときに
// DynamoDB が返す例外名。create の衝突・update/remove の不在判定に使う。
const CONDITIONAL_FAILED = "ConditionalCheckFailedException";

export class DynamoCatalogRepository implements CatalogRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async getMany(ids: string[]): Promise<Map<string, Catalog>> {
    const result = new Map<string, Catalog>();
    const uniqueIds = [...new Set(ids)].filter((id) => id);
    if (uniqueIds.length === 0) return result;

    for (let i = 0; i < uniqueIds.length; i += BATCH_LIMIT) {
      const chunk = uniqueIds.slice(i, i + BATCH_LIMIT);
      let keys = chunk.map((id) => ({ PK: CATALOG_PK, SK: catalogSk(id) }));

      // UnprocessedKeys はスロットリング時に返る。指数バックオフで数回リトライ。
      for (let attempt = 0; attempt < 5 && keys.length; attempt++) {
        const res = await this.ddb.send(
          new BatchGetCommand({
            RequestItems: { [this.tableName]: { Keys: keys } },
          }),
        );
        for (const item of res.Responses?.[this.tableName] ?? []) {
          const catalog = toCatalog(item as CatalogRecord);
          result.set(catalog.id, catalog);
        }
        const unprocessed = res.UnprocessedKeys?.[this.tableName]?.Keys ?? [];
        keys = unprocessed as typeof keys;
        if (keys.length) {
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        }
      }
    }
    return result;
  }

  // 全 Catalog を取得する。全件が PK="CATALOG" の単一パーティションに束ねられて
  // いるので、その PK を Query すれば Scan なしで取得できる（1MB 超はページング）。
  async listAll(): Promise<Catalog[]> {
    const items: Catalog[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.ddb.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": CATALOG_PK },
          ExclusiveStartKey,
        }),
      );
      for (const item of res.Items ?? []) {
        items.push(toCatalog(item as CatalogRecord));
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }

  // 新規 Catalog を保存する。同一キーが既にあれば上書きせず失敗させる。
  async create(id: string, input: CatalogInput): Promise<Catalog> {
    await this.ddb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { PK: CATALOG_PK, SK: catalogSk(id), data: input },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return { id, ...input };
  }

  // 既存 Catalog を丸ごと置き換える。存在しなければ null（呼び出し側で 404）。
  async update(id: string, input: CatalogInput): Promise<Catalog | null> {
    try {
      await this.ddb.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { PK: CATALOG_PK, SK: catalogSk(id), data: input },
          ConditionExpression: "attribute_exists(PK)",
        }),
      );
      return { id, ...input };
    } catch (err) {
      if ((err as Error).name === CONDITIONAL_FAILED) return null;
      throw err;
    }
  }

  // Catalog を削除する。元々存在しなければ false。
  async remove(id: string): Promise<boolean> {
    try {
      await this.ddb.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: CATALOG_PK, SK: catalogSk(id) },
          ConditionExpression: "attribute_exists(PK)",
        }),
      );
      return true;
    } catch (err) {
      if ((err as Error).name === CONDITIONAL_FAILED) return false;
      throw err;
    }
  }
}
