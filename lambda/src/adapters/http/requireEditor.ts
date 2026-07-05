import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { extractGroups } from "./extractGroups";
import { json, type HttpResponse } from "./httpResponse";

// 編集操作（market / catalog の作成・更新・削除）の認可。
// Cognito の "editor" グループに所属していなければ 403 を返す（許可なら null）。
// ログイン済みか（401）は API Gateway の JWT Authorizer が手前で担保しており、
// ここでは「編集権限があるか」という業務認可だけを見る。
const EDITOR_GROUP = "editor";

export const requireEditor = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): HttpResponse | null => {
  return extractGroups(event).includes(EDITOR_GROUP)
    ? null
    : json(403, { message: "Forbidden: editor role required" });
};
