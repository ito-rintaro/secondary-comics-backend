import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { ListCatalog } from "../../application/usecases/ListCatalog";
import type { CreateCatalog } from "../../application/usecases/CreateCatalog";
import type { UpdateCatalog } from "../../application/usecases/UpdateCatalog";
import type { DeleteCatalog } from "../../application/usecases/DeleteCatalog";
import { requireEditor } from "./requireEditor";
import { readJsonBody } from "./readJsonBody";
import { parseCatalogInput } from "./parseCatalogInput";
import { json, noContent, type HttpResponse } from "./httpResponse";

// HTTP(API Gateway) とユースケースの橋渡し。
// 参照系（list）はグローバルデータなので userId を使わず、認証は API Gateway の
// Cognito Authorizer が手前で済ませている。編集系（create/update/remove）は
// さらに requireEditor で "editor" グループ所属を必須にする（未所属は 403）。
export class CatalogController {
  constructor(
    private readonly listCatalog: ListCatalog,
    private readonly createCatalog: CreateCatalog,
    private readonly updateCatalog: UpdateCatalog,
    private readonly deleteCatalog: DeleteCatalog,
  ) {}

  async list(
    _event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    const catalogs = await this.listCatalog.execute();
    return json(200, catalogs);
  }

  async create(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    const denied = requireEditor(event);
    if (denied) return denied;

    const body = readJsonBody(event);
    if (!body.ok) return json(400, { message: "invalid JSON body" });

    const parsed = parseCatalogInput(body.value);
    if (!parsed.ok) return json(400, { message: parsed.error });

    const catalog = await this.createCatalog.execute(parsed.value);
    return json(201, catalog);
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

    const parsed = parseCatalogInput(body.value);
    if (!parsed.ok) return json(400, { message: parsed.error });

    const catalog = await this.updateCatalog.execute(id, parsed.value);
    if (catalog === null) {
      return json(404, { message: `unknown catalog id: ${id}` });
    }
    return json(200, catalog);
  }

  async remove(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    const denied = requireEditor(event);
    if (denied) return denied;

    const id = event.pathParameters?.id;
    if (!id) return json(400, { message: "id is required" });

    const ok = await this.deleteCatalog.execute(id);
    if (!ok) return json(404, { message: `unknown catalog id: ${id}` });
    return noContent();
  }
}
