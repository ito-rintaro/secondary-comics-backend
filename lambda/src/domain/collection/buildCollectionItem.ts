import type { CollectionItem } from "./CollectionItem";
import type { Condition } from "./Condition";
import type { Catalog } from "../catalog/Catalog";

// Collection の「所有インスタンス固有」フィールド（書誌は Catalog 側に正規化済み）。
// 現在相場（market / marketSource）は所有者が持つ値ではなく、マーケットから導出するため
// ここには含めない（保存もしない）。
export interface CollectionInstance {
  condition: Condition; // 状態ランク（この個体の状態）
  qty: number; // 所有数
  cost: number; // 取得価格（1 点あたり・円）
  purchaseDate: string; // 購入日（YYYY-MM-DD。未入力は空文字）
  store: string; // 購入店
  location: string; // 保管場所
  memo: string; // メモ（自由記述）
  updatedAt: number; // 最終更新時刻（epoch ミリ秒）
}

// 所有インスタンス + 参照先 Catalog（書誌の型）+ 現在相場 → CollectionItem。
// market は所有者の入力ではなく、その catalogId のマーケット相場から算出する:
//   相場あり → market=その価格 / marketSource="auto"
//   相場なし → market=0       / marketSource="estimate"
// 読み取り（join）と作成（create 応答）の両方で再利用する純粋関数。
export const buildCollectionItem = (
  id: string,
  instance: CollectionInstance,
  catalog: Catalog,
  price: number | undefined,
): CollectionItem => ({
  id,
  // --- Catalog 由来（カタログの型）---
  title: catalog.title,
  author: catalog.author,
  publisher: catalog.publisher,
  volume: catalog.volume,
  year: catalog.year,
  flags: catalog.flags,
  imageUrl: catalog.imageUrl,
  // --- 所有インスタンス固有 ---
  condition: instance.condition,
  qty: instance.qty,
  cost: instance.cost,
  purchaseDate: instance.purchaseDate,
  store: instance.store,
  location: instance.location,
  memo: instance.memo,
  updatedAt: instance.updatedAt,
  // --- マーケットから導出（保存しない）---
  market: price ?? 0,
  marketSource: price !== undefined ? "auto" : "estimate",
});
