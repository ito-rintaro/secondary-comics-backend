import type { MarketSale } from "../../domain/market/MarketSale";
import type { MarketInput, MarketRepository } from "../ports/MarketRepository";
import type { CatalogRepository } from "../ports/CatalogRepository";

// 成約レコード作成の結果。
// unknownCatalog は catalogId が実在しない場合（呼び出し側が 400 に変換）。
export type CreateMarketResult =
  | { ok: true; record: MarketSale }
  | { ok: false; reason: "unknownCatalog" };

// 新規 MarketSale（成約）を 1 件作成するユースケース。
// catalogId が実在する Catalog を指すか検証し、id と listedAt（登録時刻）をサーバ採番して
// 保存、Catalog を join した MarketSale を返す。相場の集計は読み取り側（summary）で行う。
export class CreateMarket {
  constructor(
    private readonly market: MarketRepository,
    private readonly catalog: CatalogRepository,
    private readonly newId: () => string,
    private readonly now: () => number,
  ) {}

  async execute(input: MarketInput): Promise<CreateMarketResult> {
    const exists = (await this.catalog.getMany([input.catalogId])).has(
      input.catalogId,
    );
    if (!exists) return { ok: false, reason: "unknownCatalog" };

    const record = await this.market.create(this.newId(), input, this.now());
    return { ok: true, record };
  }
}
