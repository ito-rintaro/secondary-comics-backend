// 画像アップロードで許可する MIME タイプと、対応する拡張子。
// セキュリティ上 SVG/HTML は許可しない（既存 web と同一オリジンの CloudFront で配信されるため
// スクリプトを内包しうる SVG は XSS ベクタになりうる）。ラスタ形式のみに限定する。
// 署名付き PUT では S3 側で中身検証まではできないため、ここで allow-list 検証する。
export const UPLOAD_CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type UploadContentType = keyof typeof UPLOAD_CONTENT_TYPES;

// contentType が許可リストに含まれるか（型ガード）。
export const isUploadContentType = (v: unknown): v is UploadContentType =>
  typeof v === "string" && v in UPLOAD_CONTENT_TYPES;

// contentType → 拡張子（"image/png" → "png"）。
export const extForContentType = (contentType: UploadContentType): string =>
  UPLOAD_CONTENT_TYPES[contentType];
