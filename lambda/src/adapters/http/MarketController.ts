import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { ListMarket } from "../../application/usecases/ListMarket";
import { json, type HttpResponse } from "./httpResponse";

// HTTP(API Gateway) とユースケースの橋渡し。
// マーケットはグローバルデータなので userId は使わない（認証自体は
// API Gateway の Cognito Authorizer がルート手前で済ませている）。
export class MarketController {
  constructor(private readonly listMarket: ListMarket) {}

  async list(
    _event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    const records = await this.listMarket.execute();
    return json(200, records);
  }
}
