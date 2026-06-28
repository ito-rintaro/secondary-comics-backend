import type { CollectionItem } from "../../domain/collection/CollectionItem";
import {
  buildCollectionItem,
  type CollectionInstance,
} from "../../domain/collection/buildCollectionItem";
import type { CollectionRepository } from "../ports/CollectionRepository";
import type { CatalogRepository } from "../ports/CatalogRepository";

// 新規 Collection 作成の入力。catalogId（参照する Catalog）＋ 所有インスタンス固有。
// updatedAt はサーバが採番するため入力には含めない。
export type CreateCollectionInput = Omit<CollectionInstance, "updatedAt"> & {
  catalogId: string;
};

// 新規 Collection を 1 件作成するユースケース。
// catalogId が実在する Catalog を指すか検証し、id と updatedAt をサーバ採番して保存、
// 作成された CollectionItem（Catalog を合成した enriched 形）を返す。
// catalogId が存在しなければ null を返す（呼び出し側が 400 に変換）。
// AWS も HTTP も知らず、ポートと注入された採番関数にのみ依存する（テスト容易）。
export class CreateCollection {
  constructor(
    private readonly collection: CollectionRepository,
    private readonly catalog: CatalogRepository,
    private readonly newId: () => string,
    private readonly now: () => number,
  ) {}

  async execute(
    userId: string,
    input: CreateCollectionInput,
  ): Promise<CollectionItem | null> {
    const catalog = (await this.catalog.getMany([input.catalogId])).get(
      input.catalogId,
    );
    if (!catalog) return null; // 参照先 Catalog が無い → 作成不可

    const id = this.newId();
    const instance: CollectionInstance = {
      condition: input.condition,
      qty: input.qty,
      cost: input.cost,
      market: input.market,
      marketSource: input.marketSource,
      purchaseDate: input.purchaseDate,
      store: input.store,
      location: input.location,
      memo: input.memo,
      updatedAt: this.now(),
    };

    await this.collection.create(userId, id, input.catalogId, instance);
    return buildCollectionItem(id, instance, catalog);
  }
}
