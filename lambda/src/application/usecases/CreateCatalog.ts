import type { Catalog } from "../../domain/catalog/Catalog";
import type {
  CatalogInput,
  CatalogRepository,
} from "../ports/CatalogRepository";

// 新規 Catalog（書誌マスタ）を 1 件作成するユースケース。
// id はサーバ採番（注入された newId）で、作成した Catalog を返す。
// AWS も HTTP も知らず、リポジトリのポートにのみ依存する。
export class CreateCatalog {
  constructor(
    private readonly repo: CatalogRepository,
    private readonly newId: () => string,
  ) {}

  execute(input: CatalogInput): Promise<Catalog> {
    return this.repo.create(this.newId(), input);
  }
}
