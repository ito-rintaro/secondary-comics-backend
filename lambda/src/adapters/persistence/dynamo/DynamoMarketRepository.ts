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
  SaleSnapshot,
  UpdatedSale,
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
// 全レコードは gsiPk="RECORD" で 1 束にまとまっているため、byNew GSI を Query すれば
// 全件を登録順で取得できる。個別 catalog の成約は byCatalog GSI（catalogId→soldAt）を
// 逆順 Query して「成約日の新しい順」で取得する。
// 書誌情報は Catalog マスタへ正規化済みのため、参照 catalogId を集めて join する。
// 相場サマリの保守（materialize）は usecase 側が MarketSummaryStore で行うため、
// update/remove は「消える側」のスナップショットを返して差分更新に供する。
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
        ExpressionAttributeValues: { ":pk": MARKET_GSI_PK },
      }),
    );
    const rows = (res.Items ?? []) as MarketSaleRow[];
    const catalogMap = await this.catalog.getMany(rows.map((r) => r.catalogId));
    return rows.map((row) =>
      toMarketSale(row, catalogMap.get(row.catalogId) ?? emptyCatalog(row.catalogId)),
    );
  }

  // 指定 catalog の成約を成約日 soldAt の新しい順で返す（byCatalog GSI を逆順 Query）。
  async listByCatalog(catalogId: string): Promise<MarketSale[]> {
    const rows: MarketSaleRow[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.ddb.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: "byCatalog",
          KeyConditionExpression: "catalogId = :cid",
          ExpressionAttributeValues: { ":cid": catalogId },
          ScanIndexForward: false, // soldAt 降順＝新しい順
          ExclusiveStartKey,
        }),
      );
      rows.push(...((res.Items ?? []) as MarketSaleRow[]));
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    const catalogMap = await this.catalog.getMany([catalogId]);
    const cat = catalogMap.get(catalogId) ?? emptyCatalog(catalogId);
    return rows.map((row) => toMarketSale(row, cat));
  }

  // 新規成約を保存する。gsiPk は全件束ねる固定値を付ける。同一 id が既にあれば失敗させる。
  async create(id: string, input: MarketInput, listedAt: number): Promise<MarketSale> {
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

  // 既存成約の可変項目を更新する。listedAt / gsiPk は保持。ReturnValues=ALL_OLD で
  // 更新前スナップショット（サマリ差分用）を取得し、更新後の sale と共に返す。存在しなければ null。
  async update(id: string, input: MarketInput): Promise<UpdatedSale | null> {
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
          ExpressionAttributeNames: { "#condition": "condition" },
          ExpressionAttributeValues: {
            ":catalogId": input.catalogId,
            ":condition": input.condition,
            ":price": input.price,
            ":soldAt": input.soldAt,
            ":seller": input.seller,
          },
          ReturnValues: "ALL_OLD",
        }),
      );
      const old = res.Attributes as MarketSaleRow;
      const newRow: MarketSaleRow = {
        marketRecordId: id,
        catalogId: input.catalogId,
        condition: input.condition,
        price: input.price,
        soldAt: input.soldAt,
        seller: input.seller,
        listedAt: old.listedAt,
      };
      const sale = await this.join(newRow);
      return {
        sale,
        previous: {
          catalogId: old.catalogId,
          price: old.price,
          soldAt: old.soldAt,
        },
      };
    } catch (err) {
      if ((err as Error).name === CONDITIONAL_FAILED) return null;
      throw err;
    }
  }

  // 成約レコードを削除する。ReturnValues=ALL_OLD で消えた成約のスナップショットを返す。
  // 元々存在しなければ null。
  async remove(id: string): Promise<SaleSnapshot | null> {
    try {
      const res = await this.ddb.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { marketRecordId: id },
          ConditionExpression: "attribute_exists(marketRecordId)",
          ReturnValues: "ALL_OLD",
        }),
      );
      const old = res.Attributes as MarketSaleRow;
      return { catalogId: old.catalogId, price: old.price, soldAt: old.soldAt };
    } catch (err) {
      if ((err as Error).name === CONDITIONAL_FAILED) return null;
      throw err;
    }
  }

  // 1 行 + 参照先 Catalog → MarketSale（listAll と同じ join を単件で行う）。
  private async join(row: MarketSaleRow): Promise<MarketSale> {
    const catalogMap = await this.catalog.getMany([row.catalogId]);
    return toMarketSale(row, catalogMap.get(row.catalogId) ?? emptyCatalog(row.catalogId));
  }
}
