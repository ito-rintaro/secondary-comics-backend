import type { ConditionFlags } from "../collection/ConditionFlags";

// catalog 単位の「相場サマリ」。取引ログ（MarketSale）を集計して導出する読み取りモデル。
// price/change/history は summarizeSales が成約列から算出する（保存はしない）。
// openapi.yaml の MarketSummary / フロントの相場一覧・チャートが消費する形と一致させる。
export interface MarketSummary {
  catalogId: string; // 集計単位＝参照する Catalog
  // --- Catalog 由来（書誌。サーバ側 join）---
  title: string; // 作品名
  author: string; // 著者
  publisher: string; // 出版社 / レーベル
  volume: string; // 巻数
  flags: ConditionFlags; // 付帯状態フラグ
  imageUrl: string; // 画像の S3 オブジェクトキー（ファイル名のみ。空文字可）
  // --- 集計値（summarizeSales で導出）---
  price: number; // 現在価格（円）= history 末尾（直近月バケット）
  change: number; // 期間変化率 (history 末尾 - 先頭) / 先頭（先頭 0 なら 0）
  history: number[]; // 月次に畳んだ擬似系列（要素数 12・末尾＝当月）。折れ線用
  sampleCount: number; // 集計に使った成約点数（相場の信頼度の目安）
  lastSoldAt: string; // 直近成約日 "YYYY-MM-DD"（成約 0 件なら空文字）
}
