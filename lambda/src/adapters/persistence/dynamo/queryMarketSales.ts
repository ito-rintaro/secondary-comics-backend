import {
  QueryCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { SaleObservation } from "../../../domain/market/summarizeSales";
import { MARKET_GSI_PK, type MarketSaleRow } from "./marketSaleMapper";

// market-record テーブルの成約レコードを扱う共有ヘルパー。
// 相場サマリ（DynamoMarketSummaryRepository）と現在相場（DynamoMarketPriceRepository）が
// 「全成約を取得 → catalogId でグルーピング → summarizeSales」という同じ骨格を共有するため、
// クエリ／グルーピング／時刻変換をここに集約して重複を避ける。

// byNew GSI（gsiPk="RECORD"）を全ページ走査して成約レコードを全件返す。
// 全レコードが単一パーティションに束ねられているため Scan を避けられる。
export const queryAllSaleRows = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
): Promise<MarketSaleRow[]> => {
  const rows: MarketSaleRow[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "byNew",
        KeyConditionExpression: "gsiPk = :pk",
        ExpressionAttributeValues: { ":pk": MARKET_GSI_PK },
        ExclusiveStartKey,
      }),
    );
    rows.push(...((res.Items ?? []) as MarketSaleRow[]));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return rows;
};

// 成約行を catalogId ごとの観測点（price/soldAt）配列にまとめる。
// catalogId / price / soldAt が欠けた不正行は無視する。
export const groupSalesByCatalog = (
  rows: readonly MarketSaleRow[],
): Map<string, SaleObservation[]> => {
  const grouped = new Map<string, SaleObservation[]>();
  for (const row of rows) {
    if (
      !row.catalogId ||
      typeof row.price !== "number" ||
      typeof row.soldAt !== "string"
    ) {
      continue;
    }
    const arr = grouped.get(row.catalogId) ?? [];
    arr.push({ price: row.price, soldAt: row.soldAt });
    grouped.set(row.catalogId, arr);
  }
  return grouped;
};

// epoch ミリ秒 → "YYYY-MM"（summarizeSales に渡す末尾月）。
// 月次チャートの基準月なので日/タイムゾーンの厳密さは不要（サーバ時刻の月でよい）。
export const epochToYearMonth = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
