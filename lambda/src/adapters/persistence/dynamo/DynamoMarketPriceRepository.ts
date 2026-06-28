import {
  QueryCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { MarketPriceRepository } from "../../../application/ports/MarketPriceRepository";
import { MARKET_GSI_PK } from "./marketRecordMapper";

// market-record テーブルから Catalog 単位の現在相場を引く MarketPriceRepository の実装。
// 全レコードは gsiPk="RECORD" で 1 束のため byNew GSI を Query して走査し、
// catalogId ごとに「最新出品（listedAt 最大）の price」を現在相場として採用する
// （1 catalog に複数出品があり得るため。今のデータは 1:1）。
interface PriceRow {
  catalogId?: string;
  price?: number;
  listedAt?: number;
}

export class DynamoMarketPriceRepository implements MarketPriceRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async pricesByCatalog(catalogIds: string[]): Promise<Map<string, number>> {
    const wanted = new Set(catalogIds.filter((id) => id));
    const result = new Map<string, number>();
    if (wanted.size === 0) return result;

    const latest = new Map<string, number>(); // catalogId → 採用中の listedAt
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.ddb.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: "byNew",
          KeyConditionExpression: "gsiPk = :pk",
          ExpressionAttributeValues: { ":pk": MARKET_GSI_PK },
          ExclusiveStartKey,
        }),
      );
      for (const row of (res.Items ?? []) as PriceRow[]) {
        const cid = row.catalogId;
        if (!cid || !wanted.has(cid) || typeof row.price !== "number") continue;
        const listedAt = row.listedAt ?? 0;
        if (!latest.has(cid) || listedAt >= (latest.get(cid) as number)) {
          latest.set(cid, listedAt);
          result.set(cid, row.price);
        }
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return result;
  }
}
