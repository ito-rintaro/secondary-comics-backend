import type { CatalogRepository } from "../ports/CatalogRepository";
import type { MarketSummaryStore } from "../ports/MarketSummaryStore";

// Catalog を削除するユースケース。
// 削除できたら相場サマリも削除して true、元々存在しなければ false（呼び出し側が 404 に変換）。
export class DeleteCatalog {
  constructor(
    private readonly repo: CatalogRepository,
    private readonly summary: MarketSummaryStore,
  ) {}

  async execute(id: string): Promise<boolean> {
    const removed = await this.repo.remove(id);
    if (removed) await this.summary.remove(id);
    return removed;
  }
}
