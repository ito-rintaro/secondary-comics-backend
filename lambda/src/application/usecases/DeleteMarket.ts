import type { MarketRepository } from "../ports/MarketRepository";

// MarketRecord を削除するユースケース。
// 削除できたら true、元々存在しなければ false（呼び出し側が 404 に変換）。
export class DeleteMarket {
  constructor(private readonly market: MarketRepository) {}

  execute(id: string): Promise<boolean> {
    return this.market.remove(id);
  }
}
