// 成約から相場統計を導出する純粋関数群。
// materialize 方針に合わせ、時間非依存の集約（月次バケット）と、時間依存の投影
// （現在月を末尾とする直近12ヶ月ウィンドウ）を分離している:
//   foldSalesToMonthly … 成約列 → 月次バケット（保存する形。月に依存しない）
//   applyBucketDelta   … 月次バケットに成約1件を加算/減算（書き込み時の差分更新）
//   buildStatsFromMonthly … 月次バケット + 現在月 → history[12]/price/change 等（読み取り時）
//   summarizeSales     … 上2つの合成（再構築・単体利用向け）
//
// history[12] の再生成ルール（月次折れ線を成立させる）:
//   - その月に成約があれば → その月の平均（四捨五入・整数円）
//   - 無ければ            → 直前月の値をキャリー（前方フィル）
//   - 最初の成約より前の月 → 最初の非空バケット値でバックフィル（0 埋めは change を壊すため）
// price = history 末尾、change = (末尾 - 先頭)/先頭 とし「price = history 末尾」を保つ。
export const HISTORY_LENGTH = 12;

export interface SaleObservation {
  price: number; // 成約価格（円）
  soldAt: string; // 成約日 "YYYY-MM-DD"
}

// 1 ヶ月分の集計（合計と件数）。平均 = sum / count。
export interface MonthBucket {
  sum: number;
  count: number;
}

// catalog 単位で保存する時間非依存の集約。
//   months     … "YYYY-MM" → { sum, count }
//   lastSoldAt … 直近成約日 "YYYY-MM-DD"（月次バケットからは日精度を復元できないため別持ち）
export interface MonthlyBuckets {
  months: Record<string, MonthBucket>;
  lastSoldAt: string;
}

export interface SaleStats {
  price: number; // 現在価格 = history 末尾
  change: number; // (history 末尾 - 先頭) / 先頭
  history: number[]; // 月次に畳んだ擬似系列（要素数 12）
  sampleCount: number; // 集計に使った成約点数（= 月次件数の総和）
  lastSoldAt: string; // 直近成約日 "YYYY-MM-DD"（0 件なら空文字）
}

// "YYYY-MM" → 連続した月インデックス（year*12 + (month-1)）。月の大小比較・差分に使う。
const ymToIndex = (ym: string): number => {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  return year * 12 + (month - 1);
};

// 空の月次バケット（成約 0 件の catalog / 初期化用）。
export const emptyBuckets = (): MonthlyBuckets => ({ months: {}, lastSoldAt: "" });

// 成約列 → 月次バケット（保存する形）。
export const foldSalesToMonthly = (
  sales: readonly SaleObservation[],
): MonthlyBuckets => {
  const buckets = emptyBuckets();
  for (const s of sales) {
    applyBucketDelta(buckets, s, 1);
  }
  return buckets;
};

// 月次バケットに成約 1 件を加算(sign=+1)または減算(sign=-1)して同じオブジェクトを返す。
// 減算で件数が 0 以下になった月バケットは削除する（負値の蓄積を防ぐ）。
// lastSoldAt は加算時のみ更新する（減算で最大値を消しても日精度の第2位を復元できないため
// 据え置き＝ベストエフォート。正確化は再構築で行う）。
export const applyBucketDelta = (
  buckets: MonthlyBuckets,
  obs: SaleObservation,
  sign: 1 | -1,
): MonthlyBuckets => {
  const ym = obs.soldAt.slice(0, 7);
  const cur = buckets.months[ym] ?? { sum: 0, count: 0 };
  const next: MonthBucket = {
    sum: cur.sum + sign * obs.price,
    count: cur.count + sign,
  };
  if (next.count <= 0) {
    delete buckets.months[ym];
  } else {
    buckets.months[ym] = next;
  }
  if (sign > 0 && obs.soldAt > buckets.lastSoldAt) {
    buckets.lastSoldAt = obs.soldAt;
  }
  return buckets;
};

// 月次バケット + 現在月 "YYYY-MM" → 相場統計（読み取り時に呼ぶ投影）。
export const buildStatsFromMonthly = (
  buckets: MonthlyBuckets,
  nowYm: string,
): SaleStats => {
  // 月インデックス → 平均価格（count>0 の月のみ）。件数の総和が sampleCount。
  const monthAvg = new Map<number, number>();
  let sampleCount = 0;
  for (const [ym, bucket] of Object.entries(buckets.months)) {
    if (bucket.count > 0) {
      monthAvg.set(ymToIndex(ym), Math.round(bucket.sum / bucket.count));
      sampleCount += bucket.count;
    }
  }
  if (sampleCount === 0) {
    return {
      price: 0,
      change: 0,
      history: new Array(HISTORY_LENGTH).fill(0),
      sampleCount: 0,
      lastSoldAt: buckets.lastSoldAt,
    };
  }

  const sortedIdx = [...monthAvg.keys()].sort((a, b) => a - b);
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
  return { price, change, history, sampleCount, lastSoldAt: buckets.lastSoldAt };
};

// 成約列 + 現在月 → 相場統計（再構築・単体利用向けの合成）。
export const summarizeSales = (
  sales: readonly SaleObservation[],
  nowYm: string,
): SaleStats => buildStatsFromMonthly(foldSalesToMonthly(sales), nowYm);
