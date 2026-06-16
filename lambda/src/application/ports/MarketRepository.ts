import type { MarketRecord } from "../../domain/market/MarketRecord";

// Market の永続化に対する「ポート」（出力ポート）。
// 実装は adapters/persistence 側に置く。usecase はこの interface だけに依存し、
// DynamoDB などの具体的な保存先を知らない。
export interface MarketRepository {
  // マーケットの相場レコードを全件返す（グローバル。0 件なら空配列）。
  listAll(): Promise<MarketRecord[]>;
}
