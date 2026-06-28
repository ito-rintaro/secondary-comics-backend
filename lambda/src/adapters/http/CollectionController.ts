import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { ListCollection } from "../../application/usecases/ListCollection";
import type { CreateCollection } from "../../application/usecases/CreateCollection";
import { extractUserId } from "./extractUserId";
import { parseNewCollection } from "./parseNewCollection";
import { json, type HttpResponse } from "./httpResponse";

// HTTP(API Gateway) とユースケースの橋渡し。
// event からユーザーを取り出し、usecase を呼び、結果を HTTP に変換する。
export class CollectionController {
  constructor(
    private readonly listCollection: ListCollection,
    private readonly createCollection: CreateCollection,
  ) {}

  async list(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    // 通常は Authorizer が無効トークンを弾くが、念のため sub が無ければ 401。
    const userId = extractUserId(event);
    if (!userId) return json(401, { message: "Unauthorized" });

    const items = await this.listCollection.execute(userId);
    return json(200, items);
  }

  async create(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    const userId = extractUserId(event);
    if (!userId) return json(401, { message: "Unauthorized" });

    let parsed: unknown;
    try {
      const raw = event.body ?? "";
      const text = event.isBase64Encoded
        ? Buffer.from(raw, "base64").toString("utf8")
        : raw;
      parsed = JSON.parse(text || "{}");
    } catch {
      return json(400, { message: "invalid JSON body" });
    }

    const result = parseNewCollection(parsed);
    if (!result.ok) return json(400, { message: result.error });

    const item = await this.createCollection.execute(userId, result.value);
    if (item === null) {
      return json(400, { message: `unknown catalogId: ${result.value.catalogId}` });
    }
    return json(201, item);
  }
}
