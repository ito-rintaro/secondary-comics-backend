import {
  QueryCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { MarketSummary } from "../../../domain/market/MarketSummary";
import type { MarketSummaryRepository } from "../../../application/ports/MarketSummaryRepository";
import type { CatalogRepository } from "../../../application/ports/CatalogRepository";
import { buildStatsFromMonthly } from "../../../domain/market/summarizeSales";
import { toMarketSummary } from "./marketSaleMapper";
import { emptyCatalog } from "./catalogRecordMapper";
import {
  MARKET_SUMMARY_PK,
  toBuckets,
  type MarketSummaryRecord,
} from "./marketSummaryMapper";
import { epochToYearMonth } from "./yearMonth";

// materialize 済みの相場サマリ（app テーブル PK="MARKET_SUMMARY"）を読む実装。
// 保存済みの月次バケットから現在月基準で history[12]/price/change/sampleCount を組み立て、
// 参照 catalogId を CatalogRepository でまとめて引いてサーバ側で join する。
// 成約 0 件（sampleCount=0）の catalog は結果から除外する（相場として意味が無いため）。
// 成約ログの全件スキャンは行わない（読み取りは 1 パーティション Query + Catalog BatchGet）。
export class DynamoMarketSummaryRepository implements MarketSummaryRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly catalog: CatalogRepository,
    private readonly now: () => number,
  ) {}

  async listSummaries(): Promise<MarketSummary[]> {
    const records: MarketSummaryRecord[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.ddb.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": MARKET_SUMMARY_PK },
          ExclusiveStartKey,
        }),
      );
      records.push(...((res.Items ?? []) as MarketSummaryRecord[]));
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    if (records.length === 0) return [];

    const nowYm = epochToYearMonth(this.now());
    const withStats = records
      .map((rec) => ({
        catalogId: rec.catalogId,
        stats: buildStatsFromMonthly(toBuckets(rec), nowYm),
      }))
      .filter((r) => r.stats.sampleCount > 0);
    if (withStats.length === 0) return [];

    const catalogMap = await this.catalog.getMany(
      withStats.map((r) => r.catalogId),
    );
    return withStats.map((r) =>
      toMarketSummary(
        r.catalogId,
        catalogMap.get(r.catalogId) ?? emptyCatalog(r.catalogId),
        r.stats,
      ),
    );
  }
}
