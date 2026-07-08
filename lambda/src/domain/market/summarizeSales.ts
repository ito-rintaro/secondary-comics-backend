// 1 catalog 分の成約列 → 相場統計（現在価格・変化率・月次擬似系列など）を導出する純粋関数。
// 取引が疎でも「月次折れ線」を成立させるため、成約を月バケットに畳んで history[12] を再生成する:
//   - その月に成約があれば → その月の成約価格の平均（四捨五入・整数円）
//   - 無ければ            → 直前月の値をキャリー（前方フィル）
//   - 最初の成約より前の月 → 最初の非空バケット値でバックフィル（0 埋めは change を壊すため）
// price = history 末尾、change = (末尾 - 先頭)/先頭 とし、「price = history 末尾」の不変条件を保つ。
// 旧 deriveMarketPrice を置き換える。now（YYYY-MM）を受け取り決定的にする（Date 非依存）。
export const HISTORY_LENGTH = 12;

export interface SaleObservation {
  price: number; // 成約価格（円）
  soldAt: string; // 成約日 "YYYY-MM-DD"
}

export interface SaleStats {
  price: number; // 現在価格 = history 末尾
  change: number; // (history 末尾 - 先頭) / 先頭
  history: number[]; // 月次に畳んだ擬似系列（要素数 12）
  sampleCount: number; // 集計に使った成約点数
  lastSoldAt: string; // 直近成約日 "YYYY-MM-DD"（0 件なら空文字）
}

// "YYYY-MM" → 連続した月インデックス（year*12 + (month-1)）。月の大小比較・差分に使う。
const ymToIndex = (ym: string): number => {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  return year * 12 + (month - 1);
};

export const summarizeSales = (
  sales: readonly SaleObservation[],
  nowYm: string, // "YYYY-MM"（history 末尾の月）
): SaleStats => {
  if (sales.length === 0) {
    return {
      price: 0,
      change: 0,
      history: new Array(HISTORY_LENGTH).fill(0),
      sampleCount: 0,
      lastSoldAt: "",
    };
  }

  // 月インデックス → { 合計, 件数 }。同月に複数成約があれば平均を取るための集計。
  const buckets = new Map<number, { sum: number; count: number }>();
  let lastSoldAt = "";
  for (const s of sales) {
    const idx = ymToIndex(s.soldAt.slice(0, 7));
    const cur = buckets.get(idx) ?? { sum: 0, count: 0 };
    cur.sum += s.price;
    cur.count += 1;
    buckets.set(idx, cur);
    if (s.soldAt > lastSoldAt) lastSoldAt = s.soldAt; // "YYYY-MM-DD" は辞書順＝時系列順
  }
  // 月インデックス → 平均価格（四捨五入・整数円）
  const monthAvg = new Map<number, number>();
  for (const [idx, { sum, count }] of buckets) {
    monthAvg.set(idx, Math.round(sum / count));
  }
  const sortedIdx = [...monthAvg.keys()].sort((a, b) => a - b);

  // 直近 12 ヶ月の各スロットを埋める（末尾＝当月）。
  const nowIndex = ymToIndex(nowYm);
  const startIndex = nowIndex - (HISTORY_LENGTH - 1);
  const slots: (number | undefined)[] = new Array(HISTORY_LENGTH).fill(undefined);
  for (let i = 0; i < HISTORY_LENGTH; i++) {
    const monthIdx = startIndex + i;
    // monthIdx 以下で最大の、データがある月の値（前方フィル）
    let carried: number | undefined;
    for (const idx of sortedIdx) {
      if (idx <= monthIdx) carried = monthAvg.get(idx);
      else break;
    }
    slots[i] = carried;
  }
  // 先頭側の未確定（データ開始前の月）は最初の非 undefined 値でバックフィル。
  const firstDefined = slots.find((v) => v !== undefined);
  const history = slots.map((v) => v ?? firstDefined ?? 0);

  const price = history[HISTORY_LENGTH - 1] ?? 0;
  const first = history[0] ?? 0;
  const change = first === 0 ? 0 : (price - first) / first;
  return { price, change, history, sampleCount: sales.length, lastSoldAt };
};
