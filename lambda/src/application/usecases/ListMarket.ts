import type { MarketSale } from "../../domain/market/MarketSale";
import type { MarketRepository } from "../ports/MarketRepository";

// マーケット成約ログの一覧を取得するユースケース。
// コレクションと異なりユーザー個別ではなく全ユーザー共通のため userId を取らない。
// AWS も HTTP も知らず、リポジトリのポートにのみ依存する（テスト容易）。
export class ListMarket {
  constructor(private readonly repo: MarketRepository) {}

  execute(): Promise<MarketSale[]> {
    return this.repo.listAll();
  }
}
