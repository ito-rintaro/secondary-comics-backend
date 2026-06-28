import type { Catalog } from "../../domain/catalog/Catalog";
import type { CatalogRepository } from "../ports/CatalogRepository";

// カタログ（書誌マスタ）の一覧を取得するユースケース。
// マーケット同様、全ユーザー共通のグローバルデータのため userId を取らない。
// AWS も HTTP も知らず、リポジトリのポートにのみ依存する（テスト容易）。
export class ListCatalog {
  constructor(private readonly repo: CatalogRepository) {}

  execute(): Promise<Catalog[]> {
    return this.repo.listAll();
  }
}
