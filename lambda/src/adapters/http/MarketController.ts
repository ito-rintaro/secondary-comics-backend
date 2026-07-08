import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { ListMarket } from "../../application/usecases/ListMarket";
import type { ListMarketSummary } from "../../application/usecases/ListMarketSummary";
import type { CreateMarket } from "../../application/usecases/CreateMarket";
import type { UpdateMarket } from "../../application/usecases/UpdateMarket";
import type { DeleteMarket } from "../../application/usecases/DeleteMarket";
import { requireEditor } from "./requireEditor";
import { readJsonBody } from "./readJsonBody";
import { parseMarketInput } from "./parseMarketInput";
import { json, noContent, type HttpResponse } from "./httpResponse";

// HTTP(API Gateway) とユースケースの橋渡し。
// 参照系（list=成約ログ / summary=相場サマリ）はグローバルデータなので userId を使わず、
// 認証は API Gateway の Cognito Authorizer が手前で済ませている。編集系
// （create/update/remove）はさらに requireEditor で "editor" グループ所属を必須にする（未所属は 403）。
export class MarketController {
  constructor(
    private readonly listMarket: ListMarket,
    private readonly listMarketSummary: ListMarketSummary,
    private readonly createMarket: CreateMarket,
    private readonly updateMarket: UpdateMarket,
    private readonly deleteMarket: DeleteMarket,
  ) {}

  // GET /market … 成約ログ（1 件 1 価格）の一覧。
  async list(
    _event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    const records = await this.listMarket.execute();
    return json(200, records);
  }

  // GET /market/summary … catalog 単位に集計した相場サマリ（相場一覧・チャートの供給源）。
  async summary(
    _event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    const summaries = await this.listMarketSummary.execute();
    return json(200, summaries);
  }

  async create(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    const denied = requireEditor(event);
    if (denied) return denied;

    const body = readJsonBody(event);
    if (!body.ok) return json(400, { message: "invalid JSON body" });

    const parsed = parseMarketInput(body.value);
    if (!parsed.ok) return json(400, { message: parsed.error });

    const result = await this.createMarket.execute(parsed.value);
    if (!result.ok) {
      return json(400, { message: `unknown catalogId: ${parsed.value.catalogId}` });
    }
    return json(201, result.record);
  }

  async update(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    const denied = requireEditor(event);
    if (denied) return denied;

    const id = event.pathParameters?.id;
    if (!id) return json(400, { message: "id is required" });

    const body = readJsonBody(event);
    if (!body.ok) return json(400, { message: "invalid JSON body" });

    const parsed = parseMarketInput(body.value);
    if (!parsed.ok) return json(400, { message: parsed.error });

    const result = await this.updateMarket.execute(id, parsed.value);
    if (!result.ok) {
      return result.reason === "unknownCatalog"
        ? json(400, { message: `unknown catalogId: ${parsed.value.catalogId}` })
        : json(404, { message: `unknown market id: ${id}` });
    }
    return json(200, result.record);
  }

  async remove(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    const denied = requireEditor(event);
    if (denied) return denied;

    const id = event.pathParameters?.id;
    if (!id) return json(400, { message: "id is required" });

    const ok = await this.deleteMarket.execute(id);
    if (!ok) return json(404, { message: `unknown market id: ${id}` });
    return noContent();
  }
}
