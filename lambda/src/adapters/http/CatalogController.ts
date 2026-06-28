import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { ListCatalog } from "../../application/usecases/ListCatalog";
import { json, type HttpResponse } from "./httpResponse";

// HTTP(API Gateway) とユースケースの橋渡し。
// カタログはグローバルデータなので userId は使わない（認証自体は
// API Gateway の Cognito Authorizer がルート手前で済ませている）。
export class CatalogController {
  constructor(private readonly listCatalog: ListCatalog) {}

  async list(
    _event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    const catalogs = await this.listCatalog.execute();
    return json(200, catalogs);
  }
}
