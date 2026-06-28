import type { CollectionItem } from "../../../domain/collection/CollectionItem";
import {
  buildCollectionItem,
  type CollectionInstance,
} from "../../../domain/collection/buildCollectionItem";
import type { Catalog } from "../../../domain/catalog/Catalog";

// app テーブル（単一テーブル）における Collection の保存形。
//   PK="USER#<sub>"  SK="COLLECTION#<id>"  data={catalogId + 所有インスタンス固有}
// 書誌（title 等）は Catalog へ、現在相場（market）はマーケットへ正規化済みで、
// ここでは持たず catalogId で参照する。market は読み取り時に算出する（保存しない）。
export const COLLECTION_PREFIX = "COLLECTION#";

// 保存ペイロード = 参照する catalogId ＋ 所有インスタンス固有フィールド。
export interface CollectionData extends CollectionInstance {
  catalogId: string; // 参照する Catalog
}

export interface CollectionRecord {
  PK: string;
  SK: string;
  data: CollectionData;
}

// userId → PK 文字列。
export const userPk = (userId: string): string => `USER#${userId}`;

// {PK,SK,data} + 参照先 Catalog + 現在相場 → CollectionItem（API/ドメインの形）。
// id は SK から COLLECTION# を外して得る。書誌×固有×相場の合成はドメイン関数に委譲。
export const toCollectionItem = (
  rec: CollectionRecord,
  catalog: Catalog,
  price: number | undefined,
): CollectionItem =>
  buildCollectionItem(
    rec.SK.slice(COLLECTION_PREFIX.length),
    rec.data,
    catalog,
    price,
  );
