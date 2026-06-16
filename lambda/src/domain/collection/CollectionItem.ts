import type { Condition } from "./Condition";
import type { ConditionFlags } from "./ConditionFlags";
import type { MarketSource } from "./MarketSource";

// 二次流通コミックの所有品 1 件。
// openapi.yaml の CollectionItem / フロント domain/collection/CollectionItem.ts と一致させる。
export interface CollectionItem {
  id: string; // アイテム識別子
  title: string; // 作品名
  author: string; // 著者
  publisher: string; // 出版社 / レーベル
  volume: string; // 巻数（"全6巻" "第1巻" 等の自由文字列）
  year: string; // 発行年（文字列）
  condition: Condition; // 状態ランク
  qty: number; // 所有数
  cost: number; // 取得価格（1 点あたり・円）
  market: number; // 現在相場（1 点あたり・円）
  marketSource: MarketSource; // 相場の出所
  flags: ConditionFlags; // 付帯状態フラグ
  purchaseDate: string; // 購入日（YYYY-MM-DD。未入力は空文字）
  store: string; // 購入店
  location: string; // 保管場所
  memo: string; // メモ（自由記述）
  imageUrl: string; // 画像 URL（空文字可）
  updatedAt: number; // 最終更新時刻（epoch ミリ秒）
}
