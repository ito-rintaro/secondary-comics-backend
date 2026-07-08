// Seed test data into the design tables (Catalog / Collection / MarketRecord).
// Writes directly to DynamoDB via the AWS SDK (plain JS objects are auto-marshalled).
// Table names are resolved from `terraform output` for the currently selected workspace.
//
// Usage:
//   cd scripts/seed && npm install   (first time only)
//   node seed.mjs
//
// Override the collection/user owner id (Cognito sub) with SEED_USER_ID if needed.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { foldSalesToMonthly, summaryItem } from "./summaryBuckets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tfDir = path.resolve(here, "../../terraform");

// --- resolve table names from terraform output ---
const out = JSON.parse(
  execSync(`terraform -chdir="${tfDir}" output -json`, { encoding: "utf8" }),
);
const T = {
  market: out.market_record_table_name.value,
  app: out.app_table_name.value, // single table: Catalog / Collection（USER# 配下）
};
console.log("Target tables:", T);

const region = process.env.AWS_REGION || "ap-northeast-1";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

// Cognito sub of the test user (test@example.com). Override via SEED_USER_ID.
const USER_ID =
  process.env.SEED_USER_ID || "37b45a28-e0a1-7085-7319-9baf49a0cb97";

const now = Date.now();

// last N months as "YYYY-MM" (oldest first).
function lastNMonths(n) {
  const base = new Date();
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

// --- source books (book identity lives in MarketRecord) ---
const books = [
  { title: "蒼穹のラプソディ", author: "東雲かなで", publisher: "青翼社",   volume: "1", year: "2019", seller: "古書みなと",   condition: "A", basePrice: 18000, flags: { firstEd: true,  obi: true,  special: false } },
  { title: "鋼鉄都市クロニクル", author: "黒崎陣",   publisher: "メカニカ書房", volume: "3", year: "2021", seller: "まんだらけ",   condition: "S", basePrice: 32000, flags: { firstEd: true,  obi: false, special: true } },
  { title: "夜想曲とねこ",     author: "白瀬ゆき",   publisher: "月夜出版",   volume: "1", year: "2018", seller: "ねこ書店",     condition: "B", basePrice: 6500,  flags: { firstEd: false, obi: false, special: false } },
  { title: "竜と契約者",       author: "火野あかり", publisher: "炎上文庫",   volume: "2", year: "2020", seller: "ドラゴン堂",   condition: "A", basePrice: 14000, flags: { firstEd: true,  obi: true,  special: false } },
  { title: "星巡りの観測者",   author: "天野星司",   publisher: "宙の書房",   volume: "1", year: "2022", seller: "古書みなと",   condition: "S", basePrice: 25000, flags: { firstEd: true,  obi: true,  special: true } },
  { title: "迷宮グルメ紀行",   author: "森野たくみ", publisher: "美食社",     volume: "4", year: "2023", seller: "まんだらけ",   condition: "C", basePrice: 4200,  flags: { firstEd: false, obi: false, special: false } },
];

const months = lastNMonths(12);

const catalogItems = [];
const marketItems = [];

books.forEach((b, i) => {
  const suffix = String(i + 1).padStart(3, "0");
  const catalogId = `cat-${suffix}`;
  const marketRecordId = `mr-${suffix}`;

  // Catalog: 書誌のマスタ（型）。Collection / Market はこれを catalogId で参照する。
  // item-collection 型キー: PK="CATALOG"(固定), SK="CATALOG#<id>"
  // → PK="CATALOG" を Query すれば全 Catalog を1発取得できる。
  catalogItems.push({
    PK: "CATALOG",
    SK: `CATALOG#${catalogId}`,
    data: {
      entityType: "Catalog",
      title: b.title,
      author: b.author,
      publisher: b.publisher,
      volume: b.volume,
      year: b.year,
      flags: b.flags,
      imageUrl: "",
    },
  });

  // MarketSale: 成約 1 件 1 価格の取引ログ。取引が疎な様子を再現するため、
  // 直近 12 ヶ月のうち一部の月にだけ成約を置く（毎月ではない）。末尾の月は
  // 「現在価格」が安定するよう必ず成約を 1 件入れる。相場（現在価格・変化率・
  // チャート系列）は保存せず、読み取り側（summarizeSales）で集計する。
  let saleNo = 0;
  months.forEach((ym, idx) => {
    const isLatest = idx === months.length - 1;
    // 隔月＋書籍ごとの位相ずれで疎にする（末尾月は必ず残す）。
    if (!isLatest && (idx + i) % 2 !== 0) return;
    const delta = Math.round(Math.sin(idx * 0.9 + i) * 0.05 * b.basePrice);
    const price = Math.max(500, b.basePrice + delta);
    const day = String(((idx * 7 + i * 3) % 27) + 1).padStart(2, "0");
    saleNo += 1;
    marketItems.push({
      marketRecordId: `${marketRecordId}-${String(saleNo).padStart(2, "0")}`,
      catalogId,
      condition: b.condition,
      price,
      soldAt: `${ym}-${day}`, // "YYYY-MM-DD"
      seller: b.seller,
      // 登録時刻（byNew の新着ソート用）。成約日とは別軸。
      listedAt: now - i * 86_400_000 + saleNo * 1000,
      gsiPk: "RECORD",
    });
  });
});

// Collection: the test user owns the first few books. 書誌は Catalog を参照（正規化）。
// 所有インスタンス固有情報（状態 / 数量 / 取得価格 / 購入情報）だけを持つ。
// single table key: PK="USER#<userId>", SK="COLLECTION#<itemId>"
const collectionItems = books.slice(0, 4).map((b, i) => {
  const suffix = String(i + 1).padStart(3, "0");
  const itemId = `col-${suffix}`;
  // 取得価格は基準価格の 7 割で見積もる（market 自体は保存しない＝読み取り時に算出）。
  const cost = Math.round(b.basePrice * 0.7);
  return {
    PK: `USER#${USER_ID}`,
    SK: `COLLECTION#${itemId}`,
    data: {
      entityType: "CollectionItem",
      userId: USER_ID,
      itemId,
      catalogId: `cat-${suffix}`,
      condition: b.condition,
      qty: i + 1,
      cost,
      purchaseDate: "2025-12-01",
      store: b.seller,
      location: `本棚-${String.fromCharCode(65 + i)}`,
      memo: i === 0 ? "サイン入り" : "",
      createdAt: now,
      updatedAt: now,
    },
  };
});

async function batchWrite(table, requests) {
  for (let i = 0; i < requests.length; i += 25) {
    const chunk = requests.slice(i, i + 25);
    let request = { [table]: chunk };
    for (let attempt = 0; attempt < 5 && Object.keys(request).length; attempt++) {
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: request }));
      request = res.UnprocessedItems ?? {};
      if (Object.keys(request).length) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }
}

async function batchPut(table, items) {
  await batchWrite(table, items.map((Item) => ({ PutRequest: { Item } })));
  console.log(`  ${table}: ${items.length} items`);
}

// 旧スキーマ（history/change を埋め込んだ 1 catalog=1 行）の残骸を消してから入れ直す。
// gsiPk="RECORD" の byNew GSI を走査して全成約行のキーを集め、まとめて削除する。
async function clearMarketRecords(table) {
  const keys = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: table,
        IndexName: "byNew",
        KeyConditionExpression: "gsiPk = :pk",
        ExpressionAttributeValues: { ":pk": "RECORD" },
        ExclusiveStartKey,
      }),
    );
    for (const it of res.Items ?? []) {
      keys.push({ marketRecordId: it.marketRecordId });
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  await batchWrite(table, keys.map((Key) => ({ DeleteRequest: { Key } })));
  console.log(`  ${table}: cleared ${keys.length} old rows`);
}

// 相場サマリ（materialize）を成約から組み立てて app テーブルに同居させる。
// 本番は成約の増減で差分更新されるが、seed はテーブルへ直接書くのでここで一括生成する。
const salesByCatalog = new Map();
for (const m of marketItems) {
  const arr = salesByCatalog.get(m.catalogId) ?? [];
  arr.push({ price: m.price, soldAt: m.soldAt });
  salesByCatalog.set(m.catalogId, arr);
}
const summaryItems = catalogItems.map((c) => {
  const catalogId = c.SK.slice("CATALOG#".length);
  return summaryItem(catalogId, foldSalesToMonthly(salesByCatalog.get(catalogId) ?? []));
});

console.log("Seeding...");
await clearMarketRecords(T.market);
await batchPut(T.market, marketItems);
// Catalog / Collection（USER# 配下）/ 相場サマリ は単一 app テーブルに同居。
await batchPut(T.app, [...catalogItems, ...collectionItems, ...summaryItems]);
console.log("Done.");
