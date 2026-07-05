import type { Catalog } from "../../domain/catalog/Catalog";
import type {
  CatalogInput,
  CatalogRepository,
} from "../ports/CatalogRepository";

// 既存 Catalog を丸ごと更新するユースケース。
// 指定 id が存在しなければ null を返す（呼び出し側が 404 に変換）。
export class UpdateCatalog {
  constructor(private readonly repo: CatalogRepository) {}

  execute(id: string, input: CatalogInput): Promise<Catalog | null> {
    return this.repo.update(id, input);
  }
}
