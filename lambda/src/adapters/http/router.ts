import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { CollectionController } from "./CollectionController";
import type { MarketController } from "./MarketController";
import type { CatalogController } from "./CatalogController";
import { json, type HttpResponse } from "./httpResponse";

// routeKey（例: "GET /collection"）に応じて適切な処理へ振り分ける。
export class Router {
  constructor(
    private readonly collection: CollectionController,
    private readonly market: MarketController,
    private readonly catalog: CatalogController,
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
      case "POST /collection":
        return this.collection.create(event);
      case "GET /market":
        return this.market.list(event);
      case "POST /market":
        return this.market.create(event);
      case "PUT /market/{id}":
        return this.market.update(event);
      case "DELETE /market/{id}":
        return this.market.remove(event);
      case "GET /catalogs":
        return this.catalog.list(event);
      case "POST /catalogs":
        return this.catalog.create(event);
      case "PUT /catalogs/{id}":
        return this.catalog.update(event);
      case "DELETE /catalogs/{id}":
        return this.catalog.remove(event);
      default:
        return json(404, { message: `no route for ${event.routeKey}` });
    }
  }
}
