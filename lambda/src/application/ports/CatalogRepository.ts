import type { Catalog } from "../../domain/catalog/Catalog";

// Catalog の書き込みペイロード（id 以外の全フィールド）。id はサーバが採番する。
export type CatalogInput = Omit<Catalog, "id">;

// カタログマスタ（Catalog）の読み書きのためのポート。
// 一覧取得時に CollectionEntry / MarketRecord が参照する catalogId をまとめて
// 解決するため、複数 id をひとまとめに取得する getMany を持つ。
export interface CatalogRepository {
  // 指定 id の Catalog を id→Catalog の Map で返す。存在しない id は含めない。
  getMany(ids: string[]): Promise<Map<string, Catalog>>;
  // 全 Catalog を返す（PK="CATALOG" の 1 パーティションを Query で走査）。
  listAll(): Promise<Catalog[]>;
  // 新規 Catalog を 1 件保存する。id は呼び出し側で採番して渡す。
  // 同一 id が既にあれば失敗させる（上書き防止）。作成した Catalog を返す。
  create(id: string, input: CatalogInput): Promise<Catalog>;
  // 既存 Catalog を丸ごと更新する。存在しなければ null を返す（404 に変換）。
  update(id: string, input: CatalogInput): Promise<Catalog | null>;
  // Catalog を削除する。存在して削除できたら true、元々無ければ false。
  remove(id: string): Promise<boolean>;
}
