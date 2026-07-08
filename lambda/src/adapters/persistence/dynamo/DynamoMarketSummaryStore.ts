import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { MarketSummaryStore } from "../../../application/ports/MarketSummaryStore";
import type {
  MonthlyBuckets,
  SaleObservation,
} from "../../../domain/market/summarizeSales";
import { applyBucketDelta, emptyBuckets } from "../../../domain/market/summarizeSales";
import {
  MARKET_SUMMARY_PK,
  summaryKey,
  toBuckets,
  type MarketSummaryRecord,
} from "./marketSummaryMapper";

const CONDITIONAL_FAILED = "ConditionalCheckFailedException";
const MAX_RETRY = 5;

// app テーブルの相場サマリ（月次バケット）を保守する MarketSummaryStore の実装。
// 成約の増減で対象 catalog のサマリ item を read-modify-write する。強整合な GetItem で
// 現在値を読み、version 条件付き PutItem で書くことで、GSI 反映遅延の影響を受けず
// 「成約追加直後に必ず反映」される。競合（version 不一致）は指数バックオフでリトライ。
export class DynamoMarketSummaryStore implements MarketSummaryStore {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async createEmpty(catalogId: string): Promise<void> {
    // 既にあれば何もしない（上書きしてバケットを消さない）。
    try {
      await this.ddb.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.newItem(catalogId, emptyBuckets(), 1),
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
    } catch (err) {
      if ((err as Error).name === CONDITIONAL_FAILED) return;
      throw err;
    }
  }

  async remove(catalogId: string): Promise<void> {
    await this.ddb.send(
      new DeleteCommand({ TableName: this.tableName, Key: summaryKey(catalogId) }),
    );
  }

  onSaleAdded(catalogId: string, sale: SaleObservation): Promise<void> {
    return this.mutate(catalogId, (b) => applyBucketDelta(b, sale, 1));
  }

  onSaleRemoved(catalogId: string, sale: SaleObservation): Promise<void> {
    return this.mutate(catalogId, (b) => applyBucketDelta(b, sale, -1));
  }

  // 対象サマリを強整合で読み → 差分適用 → version 条件付きで書く。競合時はリトライ。
  private async mutate(
    catalogId: string,
    apply: (buckets: MonthlyBuckets) => MonthlyBuckets,
  ): Promise<void> {
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const res = await this.ddb.send(
        new GetCommand({
          TableName: this.tableName,
          Key: summaryKey(catalogId),
          ConsistentRead: true,
        }),
      );
      const cur = res.Item as MarketSummaryRecord | undefined;
      const version = cur?.version ?? 0;
      const next = apply(toBuckets(cur ?? ({} as MarketSummaryRecord)));
      try {
        await this.ddb.send(
          new PutCommand({
            TableName: this.tableName,
            Item: this.newItem(catalogId, next, version + 1),
            // 新規なら未存在、既存なら version 一致を要求（lost update 防止）。
            // version は DynamoDB 予約語なので名前プレースホルダで逃がす。
            ConditionExpression: cur
              ? "#version = :v"
              : "attribute_not_exists(PK)",
            ExpressionAttributeNames: cur ? { "#version": "version" } : undefined,
            ExpressionAttributeValues: cur ? { ":v": version } : undefined,
          }),
        );
        return;
      } catch (err) {
        if ((err as Error).name === CONDITIONAL_FAILED) {
          await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
          continue; // 競合 → 読み直して再適用
        }
        throw err;
      }
    }
    throw new Error(
      `market summary update conflict for catalog ${catalogId} after ${MAX_RETRY} retries`,
    );
  }

  private newItem(
    catalogId: string,
    buckets: MonthlyBuckets,
    version: number,
  ): MarketSummaryRecord {
    return {
      PK: MARKET_SUMMARY_PK,
      SK: catalogId,
      catalogId,
      months: buckets.months,
      lastSoldAt: buckets.lastSoldAt,
      version,
    };
  }
}
