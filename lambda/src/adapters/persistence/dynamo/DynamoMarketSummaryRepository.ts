import { type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { MarketSummary } from "../../../domain/market/MarketSummary";
import type { MarketSummaryRepository } from "../../../application/ports/MarketSummaryRepository";
import type { CatalogRepository } from "../../../application/ports/CatalogRepository";
import { summarizeSales } from "../../../domain/market/summarizeSales";
import { toMarketSummary } from "./marketSaleMapper";
import { emptyCatalog } from "./catalogRecordMapper";
import {
  queryAllSaleRows,
  groupSalesByCatalog,
  epochToYearMonth,
} from "./queryMarketSales";

// market-record テーブルの成約ログを catalog 単位に集計して MarketSummary を返す実装。
// 全成約を取得 → catalogId でグルーピング → summarizeSales で相場統計を導出し、
// 参照 catalogId を CatalogRepository でまとめて引いてサーバ側で join する。
// 成約が 1 件でもある catalog だけが結果に含まれる（0 件は自然に除外）。
export class DynamoMarketSummaryRepository implements MarketSummaryRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly catalog: CatalogRepository,
    private readonly now: () => number,
  ) {}

  async listSummaries(): Promise<MarketSummary[]> {
    const rows = await queryAllSaleRows(this.ddb, this.tableName);
    const grouped = groupSalesByCatalog(rows);
    if (grouped.size === 0) return [];

    const nowYm = epochToYearMonth(this.now());
    const catalogMap = await this.catalog.getMany([...grouped.keys()]);
    const summaries: MarketSummary[] = [];
    for (const [catalogId, sales] of grouped) {
      const stats = summarizeSales(sales, nowYm);
      summaries.push(
        toMarketSummary(
          catalogId,
          catalogMap.get(catalogId) ?? emptyCatalog(catalogId),
          stats,
        ),
      );
    }
    return summaries;
  }
}
