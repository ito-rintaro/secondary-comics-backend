import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

// API Gateway の JWT Authorizer が載せた検証済みクレームから sub を取り出す。
// userId はリクエストから受け取らない（他人のデータを指定できないようにするため。
// openapi.yaml の方針）。取得できなければ null。
export const extractUserId = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): string | null => {
  const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
  return typeof sub === "string" ? sub : null;
};
