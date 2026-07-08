import {
  BatchGetCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { MarketPriceRepository } from "../../../application/ports/MarketPriceRepository";
import { buildStatsFromMonthly } from "../../../domain/market/summarizeSales";
import {
  summaryKey,
  toBuckets,
  type MarketSummaryRecord,
} from "./marketSummaryMapper";
import { epochToYearMonth } from "./yearMonth";

// materialize 済みの相場サマリ（app テーブル）から Catalog 単位の現在相場を引く実装。
// Collection は market を保存せず、読み取り/作成時にここから相場を取得して合成する。
// 指定 catalogId のサマリ item を BatchGetItem でまとめて引き、月次バケットから現在価格
// （history 末尾）を導出する。成約ログの全件スキャンは行わない。
const BATCH_LIMIT = 100;

export class DynamoMarketPriceRepository implements MarketPriceRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly now: () => number,
  ) {}

  async pricesByCatalog(catalogIds: string[]): Promise<Map<string, number>> {
    const uniqueIds = [...new Set(catalogIds)].filter((id) => id);
    const result = new Map<string, number>();
    if (uniqueIds.length === 0) return result;

    const nowYm = epochToYearMonth(this.now());
    for (let i = 0; i < uniqueIds.length; i += BATCH_LIMIT) {
      const chunk = uniqueIds.slice(i, i + BATCH_LIMIT);
      let keys = chunk.map((id) => summaryKey(id));
      for (let attempt = 0; attempt < 5 && keys.length; attempt++) {
        const res = await this.ddb.send(
          new BatchGetCommand({
            RequestItems: { [this.tableName]: { Keys: keys } },
          }),
        );
        for (const item of res.Responses?.[this.tableName] ?? []) {
          const rec = item as MarketSummaryRecord;
          const stats = buildStatsFromMonthly(toBuckets(rec), nowYm);
          // 成約 0 件（相場なし）の catalog は Map に入れない（呼び出し側で estimate 扱い）。
          if (stats.sampleCount > 0) result.set(rec.catalogId, stats.price);
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
