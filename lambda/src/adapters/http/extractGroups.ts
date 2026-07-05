import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

// JWT の cognito:groups クレームを文字列配列で返す。
// HTTP API(JWT Authorizer) は配列クレームを "[editor admin]" のような
// 文字列で載せてくることがあるため、両形式（配列 / 文字列）を吸収する。
// グループが無ければ空配列。
export const extractGroups = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): string[] => {
  const raw = event.requestContext?.authorizer?.jwt?.claims?.["cognito:groups"];
  if (Array.isArray(raw)) {
    return raw.filter((g): g is string => typeof g === "string");
  }
  if (typeof raw === "string") {
    return raw
      .replace(/^\[|\]$/g, "") // 前後の角括弧を外す
      .split(/[,\s]+/) // カンマ or 空白区切り
      .filter(Boolean);
  }
  return [];
};
