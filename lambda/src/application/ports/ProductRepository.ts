import type { Product } from "../../domain/product/Product";

// 製品マスタ（Product）を読むためのポート。
// 一覧取得時に CollectionEntry / MarketRecord が参照する productId をまとめて
// 解決するため、複数 id をひとまとめに取得する getMany を持つ。
export interface ProductRepository {
  // 指定 id の Product を id→Product の Map で返す。存在しない id は含めない。
  getMany(ids: string[]): Promise<Map<string, Product>>;
}
