import type { ConditionFlags } from "../collection/ConditionFlags";

// 二次流通マーケットの「成約 1 件」（全ユーザー共通＝グローバル）。
//   1 レコード = 1 価格 = 1 時点（append-only の取引ログ）。
// 相場（現在価格・変化率・チャート系列）はこれらを catalog 単位で集計する
// MarketSummary 側で導出する（summarizeSales）。
// openapi.yaml の MarketSale / フロント domain/market の型と一致させる。
export interface MarketSale {
  id: string; // レコード識別子（mk-<uuid>）
  // --- Catalog 由来（書誌。サーバ側 join）---
  title: string; // 作品名
  author: string; // 著者
  publisher: string; // 出版社 / レーベル
  volume: string; // 巻数（"全6巻" "第1巻" 等の自由文字列）
  flags: ConditionFlags; // 付帯状態フラグ（初版 / 帯 / 特装）
  imageUrl: string; // 画像の S3 オブジェクトキー（ファイル名のみ。空文字可）
  // --- 成約固有 ---
  catalogId: string; // 参照する Catalog
  // 鑑定記録（鑑定機関・グレード等の自由文字列）。取り得る種類が未確定のため、
  // 現状は型を固定せず任意の文字列を許容する（空文字可）。
  condition: string;
  price: number; // 成約価格（円・0 以上整数）＝単一
  soldAt: string; // 成約日 "YYYY-MM-DD"（集計・チャートの時間軸）
  seller: string; // 販売元 / ショップ名（空文字可）
}
