import type { MarketRepository } from "../ports/MarketRepository";
import type { MarketSummaryStore } from "../ports/MarketSummaryStore";

// MarketSale（成約）を削除するユースケース。
// 削除できたら相場サマリから当該成約の寄与を差し引いて true、
// 元々存在しなければ false（呼び出し側が 404 に変換）。
export class DeleteMarket {
  constructor(
    private readonly market: MarketRepository,
    private readonly summary: MarketSummaryStore,
  ) {}

  async execute(id: string): Promise<boolean> {
    const removed = await this.market.remove(id);
    if (!removed) return false;

    await this.summary.onSaleRemoved(removed.catalogId, {
      price: removed.price,
      soldAt: removed.soldAt,
    });
    return true;
  }
}
