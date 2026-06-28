import type { Catalog } from "../../domain/catalog/Catalog";

// カタログマスタ（Catalog）を読むためのポート。
// 一覧取得時に CollectionEntry / MarketRecord が参照する catalogId をまとめて
// 解決するため、複数 id をひとまとめに取得する getMany を持つ。
export interface CatalogRepository {
  // 指定 id の Catalog を id→Catalog の Map で返す。存在しない id は含めない。
  getMany(ids: string[]): Promise<Map<string, Catalog>>;
}
