import type { ConditionFlags } from "../../../domain/collection/ConditionFlags";
import type { Catalog } from "../../../domain/catalog/Catalog";

// app テーブル（単一テーブル）における Catalog マスタの保存形（アイテムコレクション型）。
//   PK="CATALOG"（固定）  SK="CATALOG#<id>"  data={...Catalog(id 以外)}
// 全 Catalog を単一パーティション(PK="CATALOG")に束ねるため、PK を Query すれば
// 全件取得、SK 指定（または begins_with）で個別・範囲取得ができる。
// 全ユーザー共通の書誌マスタ。CollectionEntry / MarketRecord から参照される hub。
export const CATALOG_PK = "CATALOG";
export const CATALOG_SK_PREFIX = "CATALOG#";

export interface CatalogRecord {
  PK: string;
  SK: string;
  data: Omit<Catalog, "id">;
}

// catalogId → SK 文字列。
export const catalogSk = (id: string): string => `${CATALOG_SK_PREFIX}${id}`;

// {PK,SK,data} → Catalog。id は SK から CATALOG# を外して得る。
export const toCatalog = (rec: CatalogRecord): Catalog => ({
  ...rec.data,
  id: rec.SK.slice(CATALOG_SK_PREFIX.length),
  imageUrl: rec.data.imageUrl ?? "", // 旧レコード(imageUrl 未保存)でも contract を満たす既定値
});

// 参照先 Catalog が見つからない場合に contract を満たすための空プレースホルダ。
// （正規化前の不整合データや、削除済み catalog を参照している行への保険）
export const emptyCatalog = (id: string): Catalog => ({
  id,
  title: "",
  author: "",
  publisher: "",
  volume: "",
  year: "",
  flags: { firstEd: false, obi: false, special: false } as ConditionFlags,
  imageUrl: "",
});
