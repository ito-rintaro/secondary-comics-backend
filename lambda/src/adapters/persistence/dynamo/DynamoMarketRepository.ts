import {
  QueryCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { MarketRecord } from "../../../domain/market/MarketRecord";
import type { MarketRepository } from "../../../application/ports/MarketRepository";
import type { ProductRepository } from "../../../application/ports/ProductRepository";
import {
  MARKET_GSI_PK,
  toMarketRecord,
  type MarketRecordRow,
} from "./marketRecordMapper";
import { emptyProduct } from "./productRecordMapper";

// 独立テーブル market-record から相場レコードを読む MarketRepository の実装。
// 全レコードは gsiPk="RECORD" で 1 束にまとまっているため、byNew GSI を
// Query すれば全件を取得できる（Scan を避け、RECORD 以外の行も自然に除外）。
// 書誌情報は Product マスタへ正規化済みのため、参照 productId を集めて
// ProductRepository でまとめて引き、サーバ側で join して MarketRecord を組み立てる。
// 並び順（新着/値上がり等）はフロント側で行うので、ここでは生の配列を返す。
export class DynamoMarketRepository implements MarketRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly products: ProductRepository,
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
    const productMap = await this.products.getMany(
      rows.map((r) => r.productId),
    );
    return rows.map((row) =>
      toMarketRecord(
        row,
        productMap.get(row.productId) ?? emptyProduct(row.productId),
      ),
    );
  }
}
