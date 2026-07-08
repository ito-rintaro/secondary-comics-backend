import type { MarketSummary } from "../../domain/market/MarketSummary";
import type { MarketSummaryRepository } from "../ports/MarketSummaryRepository";

// catalog 単位の相場サマリ一覧を取得するユースケース。
// 取引ログ（MarketSale）を集計した読み取りモデルを返す（相場一覧・チャートの供給源）。
// マーケット同様グローバルデータのため userId を取らない。
export class ListMarketSummary {
  constructor(private readonly repo: MarketSummaryRepository) {}

  execute(): Promise<MarketSummary[]> {
    return this.repo.listSummaries();
  }
}
