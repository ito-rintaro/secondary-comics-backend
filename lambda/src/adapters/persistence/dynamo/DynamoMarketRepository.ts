import {
  QueryCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { MarketRecord } from "../../../domain/market/MarketRecord";
import type { MarketRepository } from "../../../application/ports/MarketRepository";
import {
  MARKET_GSI_PK,
  toMarketRecord,
  type MarketRecordRow,
} from "./marketRecordMapper";

// 独立テーブル market-record から相場レコードを読む MarketRepository の実装。
// 全レコードは gsiPk="RECORD" で 1 束にまとまっているため、byNew GSI を
// Query すれば全件を取得できる（Scan を避け、RECORD 以外の行も自然に除外）。
// 並び順（新着/値上がり等）はフロント側で行うので、ここでは生の配列を返す。
export class DynamoMarketRepository implements MarketRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
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
    return ((res.Items ?? []) as MarketRecordRow[]).map(toMarketRecord);
  }
}
