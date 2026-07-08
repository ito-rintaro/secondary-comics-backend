import type { MarketSale } from "../../domain/market/MarketSale";
import type { MarketInput, MarketRepository } from "../ports/MarketRepository";
import type { CatalogRepository } from "../ports/CatalogRepository";

// 成約レコード更新の結果。
//   unknownCatalog … catalogId が実在しない（400）
//   notFound       … 更新対象の id が存在しない（404）
export type UpdateMarketResult =
  | { ok: true; record: MarketSale }
  | { ok: false; reason: "unknownCatalog" | "notFound" };

// 既存 MarketSale（成約）を更新するユースケース。
// catalogId の実在を検証してから可変項目を更新し、Catalog を join した結果を返す。
// listedAt（登録時刻）は保存側で保持される。
export class UpdateMarket {
  constructor(
    private readonly market: MarketRepository,
    private readonly catalog: CatalogRepository,
  ) {}

  async execute(id: string, input: MarketInput): Promise<UpdateMarketResult> {
    const exists = (await this.catalog.getMany([input.catalogId])).has(
      input.catalogId,
    );
    if (!exists) return { ok: false, reason: "unknownCatalog" };

    const record = await this.market.update(id, input);
    return record
      ? { ok: true, record }
      : { ok: false, reason: "notFound" };
  }
}
