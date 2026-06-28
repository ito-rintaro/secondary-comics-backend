import {
  QueryCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { MarketRecord } from "../../../domain/market/MarketRecord";
import type { MarketRepository } from "../../../application/ports/MarketRepository";
import type { CatalogRepository } from "../../../application/ports/CatalogRepository";
import {
  MARKET_GSI_PK,
  toMarketRecord,
  type MarketRecordRow,
} from "./marketRecordMapper";
import { emptyCatalog } from "./catalogRecordMapper";

// 独立テーブル market-record から相場レコードを読む MarketRepository の実装。
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
}
