import type { MarketRecord } from "../../domain/market/MarketRecord";
import type { Condition } from "../../domain/collection/Condition";

// Market の書き込みペイロード。書誌は catalogId で参照し、出品固有情報だけを持つ。
// price / change は history から導出するため入力に含めない（保存側で導出）。
// listedAt はサーバが採番するため入力に含めない。
export interface MarketInput {
  catalogId: string; // 参照する Catalog（実在必須）
  seller: string; // 出品者 / ショップ名
  condition: Condition; // 状態ランク
  history: number[]; // 直近12ヶ月の価格推移（要素数12）。price/change の導出元
}

// Market の永続化に対する「ポート」（出力ポート）。
// 実装は adapters/persistence 側に置く。usecase はこの interface だけに依存し、
// DynamoDB などの具体的な保存先を知らない。
export interface MarketRepository {
  // マーケットの相場レコードを全件返す（グローバル。0 件なら空配列）。
  listAll(): Promise<MarketRecord[]>;
  // 新規相場レコードを 1 件保存し、Catalog を join した MarketRecord を返す。
  // id / listedAt は呼び出し側で採番して渡す。price/change は history から導出する。
  create(id: string, input: MarketInput, listedAt: number): Promise<MarketRecord>;
  // 既存レコードの可変項目（catalogId/seller/condition/history と導出値）を更新する。
  // listedAt は保持する。存在しなければ null を返す（404 に変換）。
  update(id: string, input: MarketInput): Promise<MarketRecord | null>;
  // 相場レコードを削除する。存在して削除できたら true、元々無ければ false。
  remove(id: string): Promise<boolean>;
}
