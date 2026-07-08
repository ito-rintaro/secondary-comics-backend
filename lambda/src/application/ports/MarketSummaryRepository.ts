import type { MarketSummary } from "../../domain/market/MarketSummary";

// catalog 単位の「相場サマリ」を取得するためのポート（出力ポート）。
// 実装（adapters 側）は取引ログ（market-record）を catalogId でグルーピングし、
// summarizeSales で集計して MarketSummary を組み立てる。成約 0 件の catalog は含めない。
export interface MarketSummaryRepository {
  // 成約が 1 件以上ある全 catalog の相場サマリを返す（0 件なら空配列）。
  listSummaries(): Promise<MarketSummary[]>;
}
