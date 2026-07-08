import type { Catalog } from "../../domain/catalog/Catalog";
import type {
  CatalogInput,
  CatalogRepository,
} from "../ports/CatalogRepository";
import type { MarketSummaryStore } from "../ports/MarketSummaryStore";

// 新規 Catalog（書誌マスタ）を 1 件作成するユースケース。
// id はサーバ採番（注入された newId）で、作成した Catalog を返す。
// 併せて相場サマリの空レコードを用意する（以後の成約はここへ差分反映される）。
export class CreateCatalog {
  constructor(
    private readonly repo: CatalogRepository,
    private readonly summary: MarketSummaryStore,
    private readonly newId: () => string,
  ) {}

  async execute(input: CatalogInput): Promise<Catalog> {
    const catalog = await this.repo.create(this.newId(), input);
    await this.summary.createEmpty(catalog.id);
    return catalog;
  }
}
