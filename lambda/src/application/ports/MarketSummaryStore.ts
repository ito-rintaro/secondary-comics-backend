import type { SaleObservation } from "../../domain/market/summarizeSales";

// catalog 単位の相場サマリ（月次バケット）を保守するためのポート（書き込み側）。
// 「書き込みを重く・読み込みを軽く」する materialize 方針の中核。成約の増減で
// サマリを差分更新し、カタログのライフサイクルに合わせて作成/削除する。
// 実装は成約追加直後に必ず反映されるよう、対象サマリ 1 件を強整合で read-modify-write する。
export interface MarketSummaryStore {
  // カタログ作成時に空のサマリを用意する（既にあれば何もしない）。
  createEmpty(catalogId: string): Promise<void>;
  // カタログ削除時にサマリを削除する。
  remove(catalogId: string): Promise<void>;
  // 成約 1 件の追加をサマリに反映する（該当月バケットへ加算・lastSoldAt 更新）。
  onSaleAdded(catalogId: string, sale: SaleObservation): Promise<void>;
  // 成約 1 件の削除をサマリに反映する（該当月バケットから減算）。
  onSaleRemoved(catalogId: string, sale: SaleObservation): Promise<void>;
}
