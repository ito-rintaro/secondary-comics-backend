// history（直近12ヶ月の価格推移）から現在価格と期間変化率を導出する純粋関数。
//   price  = history 末尾（最新の価格）
//   change = (末尾 - 先頭) / 先頭（先頭が 0 のときは 0）
// 保存時に history と price/change の整合を 1 か所で保証するために使う
// （API 入力からは price/change を受け取らず、必ずここで導出する）。
export interface MarketDerived {
  price: number;
  change: number;
}

export const deriveMarketPrice = (history: number[]): MarketDerived => {
  const price = history[history.length - 1] ?? 0;
  const first = history[0] ?? 0;
  const change = first === 0 ? 0 : (price - first) / first;
  return { price, change };
};
