// 各 Catalog の「現在相場」を引くためのポート。
// Collection は market を保存せず、読み取り/作成時にここから相場を取得して合成する。
export interface MarketPriceRepository {
  // 指定 catalogId 群の現在相場（円）を catalogId→price の Map で返す。
  // 相場レコードが無い catalogId は含めない（呼び出し側で「相場なし」扱い）。
  pricesByCatalog(catalogIds: string[]): Promise<Map<string, number>>;
}
