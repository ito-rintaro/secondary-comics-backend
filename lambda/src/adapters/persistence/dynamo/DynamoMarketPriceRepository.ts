import { type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { MarketPriceRepository } from "../../../application/ports/MarketPriceRepository";
import { summarizeSales } from "../../../domain/market/summarizeSales";
import {
  queryAllSaleRows,
  groupSalesByCatalog,
  epochToYearMonth,
} from "./queryMarketSales";

// market-record テーブルから Catalog 単位の現在相場を引く MarketPriceRepository の実装。
// Collection は market を保存せず、読み取り/作成時にここから相場を取得して合成する。
// 全成約を取得 → catalogId でグルーピング → summarizeSales で集計し、その現在価格
// （history 末尾）を採用する。相場サマリ（DynamoMarketSummaryRepository）と同じ集計骨格を
// 共有し、price 部分だけを取り出す（重複ロジックを排除）。
export class DynamoMarketPriceRepository implements MarketPriceRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly now: () => number,
  ) {}

  async pricesByCatalog(catalogIds: string[]): Promise<Map<string, number>> {
    const wanted = new Set(catalogIds.filter((id) => id));
    const result = new Map<string, number>();
    if (wanted.size === 0) return result;

    const rows = await queryAllSaleRows(this.ddb, this.tableName);
    const grouped = groupSalesByCatalog(rows);
    const nowYm = epochToYearMonth(this.now());
    for (const [catalogId, sales] of grouped) {
      if (!wanted.has(catalogId)) continue;
      result.set(catalogId, summarizeSales(sales, nowYm).price);
    }
    return result;
  }
}
