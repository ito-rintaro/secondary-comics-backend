import {
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { MarketRecord } from "../../../domain/market/MarketRecord";
import type {
  MarketInput,
  MarketRepository,
} from "../../../application/ports/MarketRepository";
import type { CatalogRepository } from "../../../application/ports/CatalogRepository";
import { deriveMarketPrice } from "../../../domain/market/deriveMarketPrice";
import {
  MARKET_GSI_PK,
  toMarketRecord,
  type MarketRecordRow,
} from "./marketRecordMapper";
import { emptyCatalog } from "./catalogRecordMapper";

// 存在制御（attribute_not_exists / attribute_exists）に失敗したときの例外名。
const CONDITIONAL_FAILED = "ConditionalCheckFailedException";

// 独立テーブル market-record の相場レコードを読み書きする MarketRepository の実装。
// 全レコードは gsiPk="RECORD" で 1 束にまとまっているため、byNew GSI を
// Query すれば全件を取得できる（Scan を避け、RECORD 以外の行も自然に除外）。
// 書誌情報は Catalog マスタへ正規化済みのため、参照 catalogId を集めて
// CatalogRepository でまとめて引き、サーバ側で join して MarketRecord を組み立てる。
// 並び順（新着/値上がり等）はフロント側で行うので、ここでは生の配列を返す。
export class DynamoMarketRepository implements MarketRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly catalog: CatalogRepository,
  ) {}

  async listAll(): Promise<MarketRecord[]> {
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
    const rows = (res.Items ?? []) as MarketRecordRow[];
    const catalogMap = await this.catalog.getMany(
      rows.map((r) => r.catalogId),
    );
    return rows.map((row) =>
      toMarketRecord(
        row,
        catalogMap.get(row.catalogId) ?? emptyCatalog(row.catalogId),
      ),
    );
  }

  // 新規相場レコードを保存する。price/change は history から導出し、
  // gsiPk は全件束ねる固定値を付ける。同一 id が既にあれば失敗させる。
  async create(
    id: string,
    input: MarketInput,
    listedAt: number,
  ): Promise<MarketRecord> {
    const { price, change } = deriveMarketPrice(input.history);
    const row: MarketRecordRow = {
      marketRecordId: id,
      catalogId: input.catalogId,
      seller: input.seller,
      condition: input.condition,
      history: input.history,
      price,
      change,
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

  // 既存レコードの可変項目を更新する。listedAt / gsiPk は保持（未更新）。
  // price/change は history から再導出する。存在しなければ null。
  async update(id: string, input: MarketInput): Promise<MarketRecord | null> {
    const { price, change } = deriveMarketPrice(input.history);
    try {
      const res = await this.ddb.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { marketRecordId: id },
          UpdateExpression:
            "SET catalogId = :catalogId, seller = :seller, " +
            "#condition = :condition, history = :history, " +
            "price = :price, #change = :change",
          ConditionExpression: "attribute_exists(marketRecordId)",
          // condition / change は DynamoDB 予約語なので名前プレースホルダで逃がす。
          ExpressionAttributeNames: {
            "#condition": "condition",
            "#change": "change",
          },
          ExpressionAttributeValues: {
            ":catalogId": input.catalogId,
            ":seller": input.seller,
            ":condition": input.condition,
            ":history": input.history,
            ":price": price,
            ":change": change,
          },
          ReturnValues: "ALL_NEW",
        }),
      );
      return this.join(res.Attributes as MarketRecordRow);
    } catch (err) {
      if ((err as Error).name === CONDITIONAL_FAILED) return null;
      throw err;
    }
  }

  // 相場レコードを削除する。元々存在しなければ false。
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

  // 1 行 + 参照先 Catalog → MarketRecord（listAll と同じ join を単件で行う）。
  private async join(row: MarketRecordRow): Promise<MarketRecord> {
    const catalogMap = await this.catalog.getMany([row.catalogId]);
    return toMarketRecord(
      row,
      catalogMap.get(row.catalogId) ?? emptyCatalog(row.catalogId),
    );
  }
}
