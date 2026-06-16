import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { CollectionController } from "./CollectionController";
import type { MarketController } from "./MarketController";
import { json, type HttpResponse } from "./httpResponse";

// routeKey（例: "GET /collection"）に応じて適切な処理へ振り分ける。
export class Router {
  constructor(
    private readonly collection: CollectionController,
    private readonly market: MarketController,
  ) {}

  async handle(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    switch (event.routeKey) {
      case "GET /health":
        // 認証不要のヘルスチェック。
        return json(200, { status: "ok" });
      case "GET /collection":
        return this.collection.list(event);
      case "GET /market":
        return this.market.list(event);
      default:
        return json(404, { message: `no route for ${event.routeKey}` });
    }
  }
}
