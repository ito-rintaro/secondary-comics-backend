import type { MarketSale } from "../../domain/market/MarketSale";
import type { MarketInput, MarketRepository } from "../ports/MarketRepository";
import type { MarketSummaryStore } from "../ports/MarketSummaryStore";
import type { CatalogRepository } from "../ports/CatalogRepository";

// 成約レコード作成の結果。
// unknownCatalog は catalogId が実在しない場合（呼び出し側が 400 に変換）。
export type CreateMarketResult =
  | { ok: true; record: MarketSale }
  | { ok: false; reason: "unknownCatalog" };

// 新規 MarketSale（成約）を 1 件作成するユースケース。
// catalogId の実在を検証し、id と listedAt をサーバ採番して保存、Catalog を join して返す。
// 保存後に相場サマリへ成約 1 件を反映する（materialize＝読み取りを軽くするための書き込み）。
export class CreateMarket {
  constructor(
    private readonly market: MarketRepository,
    private readonly summary: MarketSummaryStore,
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
    await this.summary.onSaleAdded(input.catalogId, {
      price: input.price,
      soldAt: input.soldAt,
    });
    return { ok: true, record };
  }
}
