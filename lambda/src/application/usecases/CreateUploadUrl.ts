import type { PresignedUploadStore } from "../ports/PresignedUploadStore";
import {
  extForContentType,
  isUploadContentType,
} from "../../domain/upload/uploadContentType";

// 署名付き PUT URL 発行の結果。
//   unsupportedType … contentType が許可リスト外（呼び出し側が 400 に変換）
export type CreateUploadUrlResult =
  | { ok: true; ticket: UploadTicket }
  | { ok: false; reason: "unsupportedType" };

// フロントへ返すチケット。key は保存すべき imageUrl（images/ を除いたファイル名のみ）。
export interface UploadTicket {
  key: string;
  uploadUrl: string;
  expiresIn: number;
}

// カタログ画像アップロード用の署名付き PUT URL を発行するユースケース。
// contentType を許可リストで検証し、オブジェクトキーをサーバ採番（uuid + 拡張子）して
// 署名を発行する。クライアントのファイル名は使わない（パストラバーサル / 上書き事故防止）。
export class CreateUploadUrl {
  constructor(
    private readonly store: PresignedUploadStore,
    private readonly newId: () => string,
    private readonly expiresInSeconds: number,
  ) {}

  async execute(contentType: string): Promise<CreateUploadUrlResult> {
    if (!isUploadContentType(contentType)) {
      return { ok: false, reason: "unsupportedType" };
    }
    const key = `${this.newId()}.${extForContentType(contentType)}`;
    const uploadUrl = await this.store.issuePutUrl(
      key,
      contentType,
      this.expiresInSeconds,
    );
    return {
      ok: true,
      ticket: { key, uploadUrl, expiresIn: this.expiresInSeconds },
    };
  }
}
