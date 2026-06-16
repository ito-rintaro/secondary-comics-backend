import type { CollectionItem } from "../../domain/collection/CollectionItem";
import type { CollectionRepository } from "../ports/CollectionRepository";

// ログインユーザーのコレクション一覧を取得するユースケース。
// AWS も HTTP も知らず、リポジトリのポートにのみ依存する（テスト容易）。
export class ListCollection {
  constructor(private readonly repo: CollectionRepository) {}

  execute(userId: string): Promise<CollectionItem[]> {
    return this.repo.listByUser(userId);
  }
}
