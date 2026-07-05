import {
  UPLOAD_CONTENT_TYPES,
  isUploadContentType,
  type UploadContentType,
} from "../../domain/upload/uploadContentType";

// POST /uploads のボディを検証する。contentType（許可リスト内の MIME）が必須。
// 実際の許可判定はドメインの isUploadContentType に委譲する（allow-list を一元化）。
export type ParseResult =
  | { ok: true; value: { contentType: UploadContentType } }
  | { ok: false; error: string };

export const parseUploadInput = (body: unknown): ParseResult => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (!isUploadContentType(b.contentType)) {
    const allowed = Object.keys(UPLOAD_CONTENT_TYPES).join(" / ");
    return { ok: false, error: `contentType must be one of ${allowed}` };
  }

  return { ok: true, value: { contentType: b.contentType } };
};
