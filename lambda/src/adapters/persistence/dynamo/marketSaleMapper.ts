import type { MarketSale } from "../../../domain/market/MarketSale";
import type { MarketSummary } from "../../../domain/market/MarketSummary";
import type { SaleStats } from "../../../domain/market/summarizeSales";
import type { Catalog } from "../../../domain/catalog/Catalog";

// market-record テーブル（独立テーブル）における成約レコードの保存形。
//   hash_key = marketRecordId（= API の id）。属性はトップレベルにフラットに持つ。
//   gsiPk="RECORD" で全件を1束にまとめ、GSI byNew(listedAt) で新着順に取得する。
// 書誌情報（title/author/publisher/volume/flags/imageUrl）は Catalog マスタへ
// 正規化済みで、ここでは持たず catalogId で参照する。
// 相場（現在価格・変化率・チャート系列）は保存せず、読み取り側で成約列から集計する。
export const MARKET_GSI_PK = "RECORD";

export interface MarketSaleRow {
  marketRecordId: string;
  catalogId: string; // 参照する Catalog
  condition: string; // 鑑定記録（種類未確定のため任意の自由文字列。空文字可）
  price: number; // 成約価格（円）＝単一
  soldAt: string; // 成約日 "YYYY-MM-DD"
  seller: string; // 販売元 / ショップ名（成約固有）
  listedAt: number; // 登録時刻（採番）。byNew の新着ソート用
}

// テーブルの 1 行 + 参照先 Catalog → MarketSale（API/ドメインの形）。
// 書誌情報は Catalog から、成約情報は row から合成する（サーバ側 join）。
// id は marketRecordId から得る（テーブルでは id という属性名は持たない）。
export const toMarketSale = (
  row: MarketSaleRow,
  catalog: Catalog,
): MarketSale => ({
  id: row.marketRecordId,
  // --- Catalog 由来（書誌）---
  title: catalog.title,
  author: catalog.author,
  publisher: catalog.publisher,
  volume: catalog.volume,
  flags: catalog.flags,
  imageUrl: catalog.imageUrl,
  // --- 成約固有 ---
  catalogId: row.catalogId,
  condition: row.condition,
  price: row.price,
  soldAt: row.soldAt,
  seller: row.seller,
});

// catalogId + 参照先 Catalog + 集計統計（summarizeSales の結果）→ MarketSummary。
// 相場一覧・チャートが消費する catalog 単位の読み取りモデルを組み立てる。
export const toMarketSummary = (
  catalogId: string,
  catalog: Catalog,
  stats: SaleStats,
): MarketSummary => ({
  catalogId,
  // --- Catalog 由来（書誌）---
  title: catalog.title,
  author: catalog.author,
  publisher: catalog.publisher,
  volume: catalog.volume,
  flags: catalog.flags,
  imageUrl: catalog.imageUrl,
  // --- 集計値 ---
  price: stats.price,
  change: stats.change,
  history: stats.history,
  sampleCount: stats.sampleCount,
  lastSoldAt: stats.lastSoldAt,
});
