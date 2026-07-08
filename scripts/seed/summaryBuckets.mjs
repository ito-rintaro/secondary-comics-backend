// 相場サマリ（月次バケット）の組み立てヘルパー（seed / rebuild で共有）。
// lambda 側 domain/market/summarizeSales.ts の foldSalesToMonthly と同じロジックの JS 版。
// これらのスクリプトはテーブルへ直接書くため、サマリ item もここで作って一緒に入れる。

// sales: [{ price, soldAt("YYYY-MM-DD") }] → { months: { "YYYY-MM": {sum,count} }, lastSoldAt }
export function foldSalesToMonthly(sales) {
  const months = {};
  let lastSoldAt = "";
  for (const s of sales) {
    const ym = s.soldAt.slice(0, 7);
    const b = months[ym] ?? { sum: 0, count: 0 };
    b.sum += s.price;
    b.count += 1;
    months[ym] = b;
    if (s.soldAt > lastSoldAt) lastSoldAt = s.soldAt;
  }
  return { months, lastSoldAt };
}

// catalogId + 月次バケット → app テーブルの相場サマリ item。
export function summaryItem(catalogId, buckets) {
  return {
    PK: "MARKET_SUMMARY",
    SK: catalogId,
    catalogId,
    months: buckets.months,
    lastSoldAt: buckets.lastSoldAt,
    version: 1,
  };
}

// catalogId 群と成約群から、全 catalog 分のサマリ item を作る（成約 0 件は空バケット）。
// salesByCatalog: Map<catalogId, sales[]>
export function buildSummaryItems(catalogIds, salesByCatalog) {
  const ids = new Set([...catalogIds, ...salesByCatalog.keys()]);
  return [...ids].map((id) =>
    summaryItem(id, foldSalesToMonthly(salesByCatalog.get(id) ?? [])),
  );
}
