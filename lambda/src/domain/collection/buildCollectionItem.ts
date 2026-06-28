import type { CollectionItem } from "./CollectionItem";
import type { Condition } from "./Condition";
import type { MarketSource } from "./MarketSource";
import type { Catalog } from "../catalog/Catalog";

// Collection の「所有インスタンス固有」フィールド（書誌は Catalog 側に正規化済み）。
// 保存形・API 応答・作成入力で共通して使う最小の値の集まり。
export interface CollectionInstance {
  condition: Condition; // 状態ランク（この個体の状態）
  qty: number; // 所有数
  cost: number; // 取得価格（1 点あたり・円）
  market: number; // 現在相場（1 点あたり・円）
  marketSource: MarketSource; // 相場の出所
  purchaseDate: string; // 購入日（YYYY-MM-DD。未入力は空文字）
  store: string; // 購入店
  location: string; // 保管場所
  memo: string; // メモ（自由記述）
  updatedAt: number; // 最終更新時刻（epoch ミリ秒）
}

// 所有インスタンス + 参照先 Catalog（書誌の型）→ CollectionItem（API/ドメインの形）。
// 書誌は Catalog から、固有情報は instance から合成する純粋関数。
// 読み取り（join）と作成（create 応答）の両方で再利用する。
export const buildCollectionItem = (
  id: string,
  instance: CollectionInstance,
  catalog: Catalog,
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
  market: instance.market,
  marketSource: instance.marketSource,
  purchaseDate: instance.purchaseDate,
  store: instance.store,
  location: instance.location,
  memo: instance.memo,
  updatedAt: instance.updatedAt,
});
