import {
  BatchGetCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { Catalog } from "../../../domain/catalog/Catalog";
import type { CatalogRepository } from "../../../application/ports/CatalogRepository";
import {
  CATALOG_PK,
  catalogSk,
  toCatalog,
  type CatalogRecord,
} from "./catalogRecordMapper";

// 単一テーブル app から Catalog マスタを読む CatalogRepository の実装。
// 一覧取得で集めた catalogId 群を BatchGetItem でまとめて引く（N+1 を避ける）。
// BatchGetItem は 1 回あたり 100 キーまでのため 100 件ずつに分割する。
const BATCH_LIMIT = 100;

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
}
