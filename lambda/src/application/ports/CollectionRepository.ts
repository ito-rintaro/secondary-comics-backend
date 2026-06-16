import type { CollectionItem } from "../../domain/collection/CollectionItem";

// Collection の永続化に対する「ポート」（出力ポート）。
// 実装は adapters/persistence 側に置く。usecase はこの interface だけに依存し、
// DynamoDB などの具体的な保存先を知らない。
export interface CollectionRepository {
  // 指定ユーザーが所有する Collection を全件返す（0 件なら空配列）。
  listByUser(userId: string): Promise<CollectionItem[]>;
}
