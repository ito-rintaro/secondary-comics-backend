import type { CollectionItem } from "../../domain/collection/CollectionItem";
import type { CollectionInstance } from "../../domain/collection/buildCollectionItem";

// Collection の永続化に対する「ポート」（出力ポート）。
// 実装は adapters/persistence 側に置く。usecase はこの interface だけに依存し、
// DynamoDB などの具体的な保存先を知らない。
export interface CollectionRepository {
  // 指定ユーザーが所有する Collection を全件返す（0 件なら空配列）。
  listByUser(userId: string): Promise<CollectionItem[]>;

  // 新規 Collection を 1 件保存する。id は呼び出し側で採番して渡す。
  // 同一 id が既にあれば失敗させる（上書き防止）。書誌は catalogId 参照のみ持つ。
  create(
    userId: string,
    id: string,
    catalogId: string,
    instance: CollectionInstance,
  ): Promise<void>;
}
