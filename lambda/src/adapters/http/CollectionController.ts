import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { ListCollection } from "../../application/usecases/ListCollection";
import { extractUserId } from "./extractUserId";
import { json, type HttpResponse } from "./httpResponse";

// HTTP(API Gateway) とユースケースの橋渡し。
// event からユーザーを取り出し、usecase を呼び、結果を HTTP に変換する。
export class CollectionController {
  constructor(private readonly listCollection: ListCollection) {}

  async list(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    // 通常は Authorizer が無効トークンを弾くが、念のため sub が無ければ 401。
    const userId = extractUserId(event);
    if (!userId) return json(401, { message: "Unauthorized" });

    const items = await this.listCollection.execute(userId);
    return json(200, items);
  }
}
