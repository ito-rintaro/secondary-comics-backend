import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

// event.body（base64 で来る場合あり）を JSON として読む共通処理。
// 空ボディは {} とみなす。パースできなければ ok:false（呼び出し側で 400）。
export type BodyResult = { ok: true; value: unknown } | { ok: false };

export const readJsonBody = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): BodyResult => {
  try {
    const raw = event.body ?? "";
    const text = event.isBase64Encoded
      ? Buffer.from(raw, "base64").toString("utf8")
      : raw;
    return { ok: true, value: JSON.parse(text || "{}") };
  } catch {
    return { ok: false };
  }
};
