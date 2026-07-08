import type { MarketSale } from "../../domain/market/MarketSale";
import type { MarketRepository } from "../ports/MarketRepository";

// マーケット成約ログの一覧を取得するユースケース。
// catalogId を渡すとその catalog の成約を成約日の新しい順で返し、
// 省略すると全成約を登録順で返す。グローバルデータのため userId は取らない。
export class ListMarket {
  constructor(private readonly repo: MarketRepository) {}

  execute(catalogId?: string): Promise<MarketSale[]> {
    return catalogId
      ? this.repo.listByCatalog(catalogId)
      : this.repo.listAll();
  }
}
