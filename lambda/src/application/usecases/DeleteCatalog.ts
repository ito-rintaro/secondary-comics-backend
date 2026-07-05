import type { CatalogRepository } from "../ports/CatalogRepository";

// Catalog を削除するユースケース。
// 削除できたら true、元々存在しなければ false（呼び出し側が 404 に変換）。
export class DeleteCatalog {
  constructor(private readonly repo: CatalogRepository) {}

  execute(id: string): Promise<boolean> {
    return this.repo.remove(id);
  }
}
