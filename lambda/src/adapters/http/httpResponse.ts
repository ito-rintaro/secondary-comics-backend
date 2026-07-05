// API Gateway(HTTP API) へ返すレスポンスの組み立て。
export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export const json = (statusCode: number, body: unknown): HttpResponse => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

// 本文を持たない 204 応答（削除成功など）。ボディ無しなので content-type も付けない。
export const noContent = (): HttpResponse => ({
  statusCode: 204,
  headers: {},
  body: "",
});
