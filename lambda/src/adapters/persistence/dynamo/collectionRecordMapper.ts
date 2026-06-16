import type { CollectionItem } from "../../../domain/collection/CollectionItem";

// app テーブル（単一テーブル）における Collection の保存形。
//   PK="USER#<sub>"  SK="COLLECTION#<id>"  data={...CollectionItem(id 以外)}
export const COLLECTION_PREFIX = "COLLECTION#";

export interface CollectionRecord {
  PK: string;
  SK: string;
  data: Omit<CollectionItem, "id">;
}

// userId → PK 文字列。
export const userPk = (userId: string): string => `USER#${userId}`;

// {PK,SK,data} → CollectionItem。
// id は SK から COLLECTION# を外して得る（id はレコードに持たせない）。
export const toCollectionItem = (rec: CollectionRecord): CollectionItem => ({
  id: rec.SK.slice(COLLECTION_PREFIX.length),
  ...rec.data,
});
