import type { ConditionFlags } from "../collection/ConditionFlags";

// 二次流通コミックの「型（カタログのマスタ）」1 件。
// CollectionEntry / MarketRecord が共通で参照する書誌情報を一元化する hub。
// 各レコードはここを productId で参照し、固有情報だけを自分側に持つ。
//   - CollectionEntry: condition / qty / cost / 購入情報 など所有インスタンス固有
//   - MarketRecord   : seller / price / history など出品固有
export interface Product {
  id: string; // 製品識別子（prod-xxx）
  title: string; // 作品名
  author: string; // 著者
  publisher: string; // 出版社 / レーベル
  volume: string; // 巻数（"全6巻" "第1巻" 等の自由文字列）
  year: string; // 発行年（文字列）
  flags: ConditionFlags; // 付帯状態フラグ（初版 / 帯 / 特装）= カタログ属性
  imageUrl: string; // 画像の S3 オブジェクトキー（ファイル名のみ。空文字可）
}
