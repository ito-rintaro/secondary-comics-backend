import type { Condition } from "../collection/Condition";
import type { ConditionFlags } from "../collection/ConditionFlags";

// 二次流通マーケットの相場レコード 1 件（全ユーザー共通＝グローバル）。
// openapi.yaml の MarketRecord / フロント domain/market/MarketRecord.ts と一致させる。
// Condition / ConditionFlags は collection と共有する値型を再利用する。
export interface MarketRecord {
  id: string; // レコード識別子
  title: string; // 作品名
  author: string; // 著者
  publisher: string; // 出版社 / レーベル
  volume: string; // 巻数（"全6巻" "第1巻" 等の自由文字列）
  seller: string; // 出品者 / ショップ名
  condition: Condition; // 状態ランク
  flags: ConditionFlags; // 付帯状態フラグ
  history: number[]; // 直近 12 ヶ月の価格推移（円）。要素数 12・末尾が現在価格
  price: number; // 現在価格（円）。history の末尾と一致
  change: number; // 期間変化率 (末尾 - 先頭) / 先頭
  listedAt: number; // 新着ソート用の連番（大きいほど新しい）
}
