// 既存の成約ログから相場サマリ（app テーブル PK="MARKET_SUMMARY"）を作り直すスクリプト。
// テスト用の偽データは入れない。テーブルに今あるデータだけを読んでサマリを再構築する。
// materialize 導入時のバックフィルや、サマリがズレたときの修復に使う。
//
// 使い方:
//   cd scripts/seed && npm install   (初回のみ)
//   node rebuild-summaries.mjs
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { foldSalesToMonthly, summaryItem } from "./summaryBuckets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tfDir = path.resolve(here, "../../terraform");

const out = JSON.parse(
  execSync(`terraform -chdir="${tfDir}" output -json`, { encoding: "utf8" }),
);
const T = {
  market: out.market_record_table_name.value,
  app: out.app_table_name.value,
};
console.log("Target tables:", T);

const region = process.env.AWS_REGION || "ap-northeast-1";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

// PK 束（byNew の gsiPk="RECORD" / app の "CATALOG" / "MARKET_SUMMARY"）を全ページ走査する。
async function queryAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new QueryCommand({ ...params, ExclusiveStartKey }),
    );
    items.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function batchWrite(table, requests) {
  for (let i = 0; i < requests.length; i += 25) {
    let request = { [table]: requests.slice(i, i + 25) };
    for (let attempt = 0; attempt < 5 && Object.keys(request).length; attempt++) {
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: request }));
      request = res.UnprocessedItems ?? {};
      if (Object.keys(request).length) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }
}

console.log("Reading catalogs and sales...");
// 全 catalogId（成約 0 件の本にも空サマリを用意するため）。
const catalogRows = await queryAll({
  TableName: T.app,
  KeyConditionExpression: "PK = :pk",
  ExpressionAttributeValues: { ":pk": "CATALOG" },
});
const catalogIds = catalogRows.map((r) => String(r.SK).slice("CATALOG#".length));

// 全成約（byNew GSI）。catalogId/price/soldAt を集める。
const saleRows = await queryAll({
  TableName: T.market,
  IndexName: "byNew",
  KeyConditionExpression: "gsiPk = :pk",
  ExpressionAttributeValues: { ":pk": "RECORD" },
});
const salesByCatalog = new Map();
for (const r of saleRows) {
  if (!r.catalogId || typeof r.price !== "number" || typeof r.soldAt !== "string") continue;
  const arr = salesByCatalog.get(r.catalogId) ?? [];
  arr.push({ price: r.price, soldAt: r.soldAt });
  salesByCatalog.set(r.catalogId, arr);
}
console.log(`  catalogs: ${catalogIds.length}, sales: ${saleRows.length}`);

// 既存のサマリを一旦削除（削除済み catalog の残骸を残さない）。
const oldSummaries = await queryAll({
  TableName: T.app,
  KeyConditionExpression: "PK = :pk",
  ExpressionAttributeValues: { ":pk": "MARKET_SUMMARY" },
});
if (oldSummaries.length) {
  await batchWrite(
    T.app,
    oldSummaries.map((it) => ({
      DeleteRequest: { Key: { PK: it.PK, SK: it.SK } },
    })),
  );
  console.log(`  cleared ${oldSummaries.length} old summaries`);
}

// 全 catalog 分のサマリを再構築して書き込む。
const ids = new Set([...catalogIds, ...salesByCatalog.keys()]);
const items = [...ids].map((id) =>
  summaryItem(id, foldSalesToMonthly(salesByCatalog.get(id) ?? [])),
);
await batchWrite(
  T.app,
  items.map((Item) => ({ PutRequest: { Item } })),
);
console.log(`Rebuilt ${items.length} summaries. Done.`);
