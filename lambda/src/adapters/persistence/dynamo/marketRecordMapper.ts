import type { Condition } from "../../../domain/collection/Condition";
import type { MarketRecord } from "../../../domain/market/MarketRecord";
import type { Catalog } from "../../../domain/catalog/Catalog";

// market-record テーブル（独立テーブル）における相場レコードの保存形。
//   hash_key = marketRecordId（= API の id）。属性はトップレベルにフラットに持つ。
//   gsiPk="RECORD" で全件を1束にまとめ、GSI byNew(listedAt) / byPrice(price) でソート取得する。
// 書誌情報（title/author/publisher/volume/flags/imageUrl）は Catalog マスタへ
// 正規化済みで、ここでは持たず catalogId で参照する。
export const MARKET_GSI_PK = "RECORD";

export interface MarketRecordRow {
  marketRecordId: string;
  catalogId: string; // 参照する Catalog
  seller: string; // 出品者 / ショップ名（出品固有）
  condition: Condition; // 状態ランク（この出品個体の状態）
  history: number[]; // 直近 12 ヶ月の価格推移（円）
  price: number; // 現在価格（円）
  change: number; // 期間変化率
  listedAt: number; // 新着ソート用の連番（大きいほど新しい）
}

// テーブルの 1 行 + 参照先 Catalog → MarketRecord（API/ドメインの形）。
// 書誌情報は Catalog から、価格・出品情報は row から合成する（サーバ側 join）。
// id は marketRecordId から得る（テーブルでは id という属性名は持たない）。
export const toMarketRecord = (
  row: MarketRecordRow,
  catalog: Catalog,
): MarketRecord => ({
  id: row.marketRecordId,
  // --- Catalog 由来（カタログの型）---
  title: catalog.title,
  author: catalog.author,
  publisher: catalog.publisher,
  volume: catalog.volume,
  flags: catalog.flags,
  imageUrl: catalog.imageUrl,
  // --- 出品固有 ---
  seller: row.seller,
  condition: row.condition,
  history: row.history,
  price: row.price,
  change: row.change,
  listedAt: row.listedAt,
});
