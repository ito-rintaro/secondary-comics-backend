import type { CollectionItem } from "../../../domain/collection/CollectionItem";
import type { Condition } from "../../../domain/collection/Condition";
import type { MarketSource } from "../../../domain/collection/MarketSource";
import type { Product } from "../../../domain/product/Product";

// app テーブル（単一テーブル）における Collection の保存形。
//   PK="USER#<sub>"  SK="COLLECTION#<id>"  data={...所有インスタンス固有情報}
// 書誌情報（title/author/publisher/volume/year/flags/imageUrl）は Product マスタへ
// 正規化済みで、ここでは持たず productId で参照する。
export const COLLECTION_PREFIX = "COLLECTION#";

// 所有インスタンス固有の保存ペイロード。Product の書誌は含めない。
export interface CollectionData {
  productId: string; // 参照する Product
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

export interface CollectionRecord {
  PK: string;
  SK: string;
  data: CollectionData;
}

// userId → PK 文字列。
export const userPk = (userId: string): string => `USER#${userId}`;

// {PK,SK,data} + 参照先 Product → CollectionItem（API/ドメインの形）。
// 書誌情報は Product から、固有情報は data から合成する（サーバ側 join）。
// id は SK から COLLECTION# を外して得る（id はレコードに持たせない）。
export const toCollectionItem = (
  rec: CollectionRecord,
  product: Product,
): CollectionItem => ({
  id: rec.SK.slice(COLLECTION_PREFIX.length),
  // --- Product 由来（カタログの型）---
  title: product.title,
  author: product.author,
  publisher: product.publisher,
  volume: product.volume,
  year: product.year,
  flags: product.flags,
  imageUrl: product.imageUrl,
  // --- 所有インスタンス固有 ---
  condition: rec.data.condition,
  qty: rec.data.qty,
  cost: rec.data.cost,
  market: rec.data.market,
  marketSource: rec.data.marketSource,
  purchaseDate: rec.data.purchaseDate,
  store: rec.data.store,
  location: rec.data.location,
  memo: rec.data.memo,
  updatedAt: rec.data.updatedAt,
});
