// epoch ミリ秒 → "YYYY-MM"（buildStatsFromMonthly に渡す「現在月」）。
// 月次チャートの基準月なので日/タイムゾーンの厳密さは不要（サーバ時刻の月でよい）。
export const epochToYearMonth = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
