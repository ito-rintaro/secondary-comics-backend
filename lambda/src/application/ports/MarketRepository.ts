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

// 相場サマリの差分更新に必要な、成約の最小スナップショット。
// update/remove が「消える側」の値を返し、呼び出し側がサマリからその寄与を差し引く。
export interface SaleSnapshot {
  catalogId: string;
  price: number;
  soldAt: string;
}

// update の結果。sale=更新後（API 応答用）、previous=更新前スナップショット（サマリ差分用）。
export interface UpdatedSale {
  sale: MarketSale;
  previous: SaleSnapshot;
}

// マーケット成約ログの永続化に対する「ポート」（出力ポート）。
// 実装は adapters/persistence 側に置く。usecase はこの interface だけに依存し、
// DynamoDB などの具体的な保存先を知らない。
export interface MarketRepository {
  // 成約レコードを全件返す（グローバル。0 件なら空配列。新着順=登録順）。
  listAll(): Promise<MarketSale[]>;
  // 指定 catalog の成約を成約日 soldAt の新しい順で返す（byCatalog GSI）。
  listByCatalog(catalogId: string): Promise<MarketSale[]>;
  // 新規成約を 1 件保存し、Catalog を join した MarketSale を返す。
  // id は呼び出し側で採番して渡す。listedAt（登録時刻）は byNew の新着ソート用。
  create(id: string, input: MarketInput, listedAt: number): Promise<MarketSale>;
  // 既存成約の可変項目を更新する。listedAt は保持する。
  // 更新後の sale と更新前スナップショット（previous）を返す。存在しなければ null。
  update(id: string, input: MarketInput): Promise<UpdatedSale | null>;
  // 成約レコードを削除する。削除できたら消えた成約のスナップショット、元々無ければ null。
  remove(id: string): Promise<SaleSnapshot | null>;
}
