import type { MarketRecord } from "../../domain/market/MarketRecord";
import type { MarketInput, MarketRepository } from "../ports/MarketRepository";
import type { CatalogRepository } from "../ports/CatalogRepository";

// 相場レコード作成の結果。
// unknownCatalog は catalogId が実在しない場合（呼び出し側が 400 に変換）。
export type CreateMarketResult =
  | { ok: true; record: MarketRecord }
  | { ok: false; reason: "unknownCatalog" };

// 新規 MarketRecord を 1 件作成するユースケース。
// catalogId が実在する Catalog を指すか検証し、id と listedAt をサーバ採番して保存、
// Catalog を join した MarketRecord を返す。price/change は保存側で history から導出。
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
