import type { ConditionFlags } from "../../../domain/collection/ConditionFlags";
import type { Product } from "../../../domain/product/Product";

// app テーブル（単一テーブル）における Product マスタの保存形（アイテムコレクション型）。
//   PK="PRODUCT"（固定）  SK="PRODUCT#<id>"  data={...Product(id 以外)}
// 全 Product を単一パーティション(PK="PRODUCT")に束ねるため、PK を Query すれば
// 全件取得、SK 指定（または begins_with）で個別・範囲取得ができる。
// 全ユーザー共通の書誌マスタ。CollectionEntry / MarketRecord から参照される hub。
export const PRODUCT_PK = "PRODUCT";
export const PRODUCT_SK_PREFIX = "PRODUCT#";

export interface ProductRecord {
  PK: string;
  SK: string;
  data: Omit<Product, "id">;
}

// productId → SK 文字列。
export const productSk = (id: string): string => `${PRODUCT_SK_PREFIX}${id}`;

// {PK,SK,data} → Product。id は SK から PRODUCT# を外して得る。
export const toProduct = (rec: ProductRecord): Product => ({
  ...rec.data,
  id: rec.SK.slice(PRODUCT_SK_PREFIX.length),
  imageUrl: rec.data.imageUrl ?? "", // 旧レコード(imageUrl 未保存)でも contract を満たす既定値
});

// 参照先 Product が見つからない場合に contract を満たすための空プレースホルダ。
// （正規化前の不整合データや、削除済み product を参照している行への保険）
export const emptyProduct = (id: string): Product => ({
  id,
  title: "",
  author: "",
  publisher: "",
  volume: "",
  year: "",
  flags: { firstEd: false, obi: false, special: false } as ConditionFlags,
  imageUrl: "",
});
