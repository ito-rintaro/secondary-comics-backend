// Seed test data into the design tables (Collection / MarketRecord / Price / User).
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
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const here = path.dirname(fileURLToPath(import.meta.url));
const tfDir = path.resolve(here, "../../terraform");

// --- resolve table names from terraform output ---
const out = JSON.parse(
  execSync(`terraform -chdir="${tfDir}" output -json`, { encoding: "utf8" }),
);
const T = {
  market: out.market_record_table_name.value,
  app: out.app_table_name.value, // single table: User / Collection / Price
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

const marketItems = [];
const priceItems = [];

books.forEach((b, i) => {
  const suffix = String(i + 1).padStart(3, "0");
  const marketRecordId = `mr-${suffix}`;
  const priceId = `pr-${suffix}`;

  // generate a 12-month price series with mild wiggle around the base price.
  let p = b.basePrice;
  const history = months.map((_, idx) => {
    const delta = Math.round(Math.sin(idx * 0.9 + i) * 0.05 * b.basePrice);
    p = Math.max(500, b.basePrice + delta);
    return p;
  });
  const first = history[0];
  const last = history[history.length - 1];
  const change = Number(((last - first) / first).toFixed(4));
  const listedAt = now - i * 86_400_000; // stagger by day for byNew sorting

  // Price: one item per month (the source of truth for the time series).
  // single table key: PK="PRICE#<priceId>", SK="<YYYY-MM>"
  // payload is stored under the `data` map (everything except PK/SK).
  months.forEach((m, idx) => {
    priceItems.push({
      PK: `PRICE#${priceId}`,
      SK: m,
      data: {
        entityType: "PricePoint",
        priceId,
        month: m,
        price: history[idx],
      },
    });
  });

  // MarketRecord: cached price/history for fast list rendering. gsiPk groups all records.
  marketItems.push({
    marketRecordId,
    priceId,
    title: b.title,
    author: b.author,
    publisher: b.publisher,
    volume: b.volume,
    year: b.year,
    seller: b.seller,
    condition: b.condition,
    flags: b.flags,
    price: last,
    change,
    history,
    listedAt,
    gsiPk: "RECORD",
  });
});

// Collection: the test user owns the first few books (references MarketRecord).
// single table key: PK="USER#<userId>", SK="ITEM#<itemId>"
const collectionItems = books.slice(0, 4).map((b, i) => {
  const suffix = String(i + 1).padStart(3, "0");
  const itemId = `col-${suffix}`;
  const market = marketItems[i].price;
  return {
    PK: `USER#${USER_ID}`,
    SK: `ITEM#${itemId}`,
    data: {
      entityType: "CollectionItem",
      userId: USER_ID,
      itemId,
      marketRecordId: `mr-${suffix}`,
      qty: i + 1,
      cost: Math.round(market * 0.7),
      market,
      marketSource: "auto",
      purchaseDate: "2025-12-01",
      store: b.seller,
      location: `本棚-${String.fromCharCode(65 + i)}`,
      memo: i === 0 ? "サイン入り" : "",
      imageKey: "",
      createdAt: now,
      updatedAt: now,
    },
  };
});

// User: the test user's profile.
// single table key: PK="USER#<userId>", SK="PROFILE"
const userItems = [
  {
    PK: `USER#${USER_ID}`,
    SK: "PROFILE",
    data: {
      entityType: "User",
      userId: USER_ID,
      email: "test@example.com",
      displayName: "テストユーザー",
      createdAt: now,
    },
  },
];

async function batchPut(table, items) {
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    let request = { [table]: chunk.map((Item) => ({ PutRequest: { Item } })) };
    for (let attempt = 0; attempt < 5 && Object.keys(request).length; attempt++) {
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: request }));
      request = res.UnprocessedItems ?? {};
      if (Object.keys(request).length) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }
  console.log(`  ${table}: ${items.length} items`);
}

console.log("Seeding...");
await batchPut(T.market, marketItems);
// User / Collection / Price all live in the single app table.
await batchPut(T.app, [...userItems, ...collectionItems, ...priceItems]);
console.log("Done.");
