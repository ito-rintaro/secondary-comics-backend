import type { Condition } from "../../../domain/collection/Condition";
import type { ConditionFlags } from "../../../domain/collection/ConditionFlags";
import type { MarketRecord } from "../../../domain/market/MarketRecord";

// market-record テーブル（独立テーブル）における相場レコードの保存形。
//   hash_key = marketRecordId（= API の id）。属性はトップレベルにフラットに持つ。
//   gsiPk="RECORD" で全件を1束にまとめ、GSI byNew(listedAt) / byPrice(price) でソート取得する。
// 一覧取得に不要な priceId / year / gsiPk などの付加属性は読み飛ばす。
export const MARKET_GSI_PK = "RECORD";

export interface MarketRecordRow {
  marketRecordId: string;
  title: string;
  author: string;
  publisher: string;
  volume: string;
  seller: string;
  condition: Condition;
  flags: ConditionFlags;
  history: number[];
  price: number;
  change: number;
  listedAt: number;
}

// テーブルの 1 行 → MarketRecord（API/ドメインの形）。
// id は marketRecordId から得る（テーブルでは id という属性名は持たない）。
export const toMarketRecord = (row: MarketRecordRow): MarketRecord => ({
  id: row.marketRecordId,
  title: row.title,
  author: row.author,
  publisher: row.publisher,
  volume: row.volume,
  seller: row.seller,
  condition: row.condition,
  flags: row.flags,
  history: row.history,
  price: row.price,
  change: row.change,
  listedAt: row.listedAt,
});
