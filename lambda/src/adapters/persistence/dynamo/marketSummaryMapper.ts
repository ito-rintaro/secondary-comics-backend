import type { MonthlyBuckets } from "../../../domain/market/summarizeSales";

// app テーブル（単一テーブル）における相場サマリの保存形（catalog 単位）。
//   PK="MARKET_SUMMARY"（固定）  SK=<catalogId>
//   data は月次バケット（months / lastSoldAt）と楽観ロック用の version をトップレベルに持つ。
// 全サマリを単一パーティション PK="MARKET_SUMMARY" に束ねるので、PK を Query すれば
// 全 catalog のサマリを 1 系統で取得できる（Catalog 一覧の PK="CATALOG" とは別束）。
// price/change/history[12]/sampleCount は保存せず、読み取り時に buildStatsFromMonthly で導出する
// （現在月を末尾とするローリング窓なので、月替わりでも常に正しくなる）。
export const MARKET_SUMMARY_PK = "MARKET_SUMMARY";

export interface MarketSummaryRecord {
  PK: string;
  SK: string; // = catalogId
  catalogId: string;
  months: MonthlyBuckets["months"];
  lastSoldAt: string;
  version: number; // 楽観ロック（read-modify-write の競合検知）
}

// catalogId → サマリ item のキー。
export const summaryKey = (catalogId: string): { PK: string; SK: string } => ({
  PK: MARKET_SUMMARY_PK,
  SK: catalogId,
});

// 保存 item → 月次バケット（読み取り時に buildStatsFromMonthly へ渡す）。
// 旧 item（months 未保存）でも空バケットで contract を満たす。
export const toBuckets = (rec: MarketSummaryRecord): MonthlyBuckets => ({
  months: rec.months ?? {},
  lastSoldAt: rec.lastSoldAt ?? "",
});
