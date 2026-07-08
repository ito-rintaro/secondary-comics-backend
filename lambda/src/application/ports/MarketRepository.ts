import type { MarketSale } from "../../domain/market/MarketSale";
import type { Condition } from "../../domain/collection/Condition";

// 成約（MarketSale）の書き込みペイロード。書誌は catalogId で参照し、成約固有情報だけを持つ。
// id はサーバ採番、listedAt（登録時刻）は byNew の新着ソート用にサーバが採番するため含めない。
export interface MarketInput {
  catalogId: string; // 参照する Catalog（実在必須）
  condition: Condition; // この成約個体の状態ランク
  price: number; // 成約価格（円・0 以上整数）
  soldAt: string; // 成約日 "YYYY-MM-DD"
  seller: string; // 販売元 / ショップ名（空文字可）
}

// マーケット成約ログの永続化に対する「ポート」（出力ポート）。
// 実装は adapters/persistence 側に置く。usecase はこの interface だけに依存し、
// DynamoDB などの具体的な保存先を知らない。
export interface MarketRepository {
  // 成約レコードを全件返す（グローバル。0 件なら空配列。新着順）。
  listAll(): Promise<MarketSale[]>;
  // 新規成約を 1 件保存し、Catalog を join した MarketSale を返す。
  // id は呼び出し側で採番して渡す。listedAt（登録時刻）は byNew の新着ソート用。
  create(id: string, input: MarketInput, listedAt: number): Promise<MarketSale>;
  // 既存成約の可変項目（catalogId/condition/price/soldAt/seller）を更新する。
  // listedAt は保持する。存在しなければ null を返す（404 に変換）。
  update(id: string, input: MarketInput): Promise<MarketSale | null>;
  // 成約レコードを削除する。存在して削除できたら true、元々無ければ false。
  remove(id: string): Promise<boolean>;
}
