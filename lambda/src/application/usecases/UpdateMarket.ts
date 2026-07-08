import type { MarketSale } from "../../domain/market/MarketSale";
import type { MarketInput, MarketRepository } from "../ports/MarketRepository";
import type { MarketSummaryStore } from "../ports/MarketSummaryStore";
import type { CatalogRepository } from "../ports/CatalogRepository";

// 成約レコード更新の結果。
//   unknownCatalog … catalogId が実在しない（400）
//   notFound       … 更新対象の id が存在しない（404）
export type UpdateMarketResult =
  | { ok: true; record: MarketSale }
  | { ok: false; reason: "unknownCatalog" | "notFound" };

// 既存 MarketSale（成約）を更新するユースケース。
// catalogId の実在を検証してから可変項目を更新し、Catalog を join した結果を返す。
// 更新に伴い相場サマリを保守する: 更新前の寄与を（旧 catalog から）差し引き、
// 更新後の寄与を（新 catalog へ）加える。catalog を跨ぐ更新でも両サマリが整合する。
export class UpdateMarket {
  constructor(
    private readonly market: MarketRepository,
    private readonly summary: MarketSummaryStore,
    private readonly catalog: CatalogRepository,
  ) {}

  async execute(id: string, input: MarketInput): Promise<UpdateMarketResult> {
    const exists = (await this.catalog.getMany([input.catalogId])).has(
      input.catalogId,
    );
    if (!exists) return { ok: false, reason: "unknownCatalog" };

    const updated = await this.market.update(id, input);
    if (!updated) return { ok: false, reason: "notFound" };

    const { sale, previous } = updated;
    await this.summary.onSaleRemoved(previous.catalogId, {
      price: previous.price,
      soldAt: previous.soldAt,
    });
    await this.summary.onSaleAdded(input.catalogId, {
      price: input.price,
      soldAt: input.soldAt,
    });
    return { ok: true, record: sale };
  }
}
