import {
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { MarketSale } from "../../../domain/market/MarketSale";
import type {
  MarketInput,
  MarketRepository,
} from "../../../application/ports/MarketRepository";
import type { CatalogRepository } from "../../../application/ports/CatalogRepository";
import {
  MARKET_GSI_PK,
  toMarketSale,
  type MarketSaleRow,
} from "./marketSaleMapper";
import { emptyCatalog } from "./catalogRecordMapper";

// 存在制御（attribute_not_exists / attribute_exists）に失敗したときの例外名。
const CONDITIONAL_FAILED = "ConditionalCheckFailedException";

// 独立テーブル market-record の成約レコードを読み書きする MarketRepository の実装。
// 全レコードは gsiPk="RECORD" で 1 束にまとまっているため、byNew GSI を
// Query すれば全件を新着順で取得できる（Scan を避け、RECORD 以外の行も自然に除外）。
// 書誌情報は Catalog マスタへ正規化済みのため、参照 catalogId を集めて
// CatalogRepository でまとめて引き、サーバ側で join して MarketSale を組み立てる。
// 相場の集計（現在価格・変化率・チャート系列）は読み取り側（summary）で行うため、
// ここでは成約を 1 件 1 価格でそのまま読み書きするだけ。
export class DynamoMarketRepository implements MarketRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly catalog: CatalogRepository,
  ) {}

  async listAll(): Promise<MarketSale[]> {
    const res = await this.ddb.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "byNew",
        KeyConditionExpression: "gsiPk = :pk",
        ExpressionAttributeValues: {
          ":pk": MARKET_GSI_PK,
        },
      }),
    );
    const rows = (res.Items ?? []) as MarketSaleRow[];
    const catalogMap = await this.catalog.getMany(
      rows.map((r) => r.catalogId),
    );
    return rows.map((row) =>
      toMarketSale(
        row,
        catalogMap.get(row.catalogId) ?? emptyCatalog(row.catalogId),
      ),
    );
  }

  // 新規成約を保存する。gsiPk は全件束ねる固定値を付ける。同一 id が既にあれば失敗させる。
  async create(
    id: string,
    input: MarketInput,
    listedAt: number,
  ): Promise<MarketSale> {
    const row: MarketSaleRow = {
      marketRecordId: id,
      catalogId: input.catalogId,
      condition: input.condition,
      price: input.price,
      soldAt: input.soldAt,
      seller: input.seller,
      listedAt,
    };
    await this.ddb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { ...row, gsiPk: MARKET_GSI_PK },
        ConditionExpression: "attribute_not_exists(marketRecordId)",
      }),
    );
    return this.join(row);
  }

  // 既存成約の可変項目を更新する。listedAt / gsiPk は保持（未更新）。存在しなければ null。
  async update(id: string, input: MarketInput): Promise<MarketSale | null> {
    try {
      const res = await this.ddb.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { marketRecordId: id },
          UpdateExpression:
            "SET catalogId = :catalogId, #condition = :condition, " +
            "price = :price, soldAt = :soldAt, seller = :seller",
          ConditionExpression: "attribute_exists(marketRecordId)",
          // condition は DynamoDB 予約語なので名前プレースホルダで逃がす。
          ExpressionAttributeNames: {
            "#condition": "condition",
          },
          ExpressionAttributeValues: {
            ":catalogId": input.catalogId,
            ":condition": input.condition,
            ":price": input.price,
            ":soldAt": input.soldAt,
            ":seller": input.seller,
          },
          ReturnValues: "ALL_NEW",
        }),
      );
      return this.join(res.Attributes as MarketSaleRow);
    } catch (err) {
      if ((err as Error).name === CONDITIONAL_FAILED) return null;
      throw err;
    }
  }

  // 成約レコードを削除する。元々存在しなければ false。
  async remove(id: string): Promise<boolean> {
    try {
      await this.ddb.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { marketRecordId: id },
          ConditionExpression: "attribute_exists(marketRecordId)",
        }),
      );
      return true;
    } catch (err) {
      if ((err as Error).name === CONDITIONAL_FAILED) return false;
      throw err;
    }
  }

  // 1 行 + 参照先 Catalog → MarketSale（listAll と同じ join を単件で行う）。
  private async join(row: MarketSaleRow): Promise<MarketSale> {
    const catalogMap = await this.catalog.getMany([row.catalogId]);
    return toMarketSale(
      row,
      catalogMap.get(row.catalogId) ?? emptyCatalog(row.catalogId),
    );
  }
}
