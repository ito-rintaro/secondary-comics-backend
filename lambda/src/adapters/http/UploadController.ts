import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { CreateUploadUrl } from "../../application/usecases/CreateUploadUrl";
import { requireEditor } from "./requireEditor";
import { readJsonBody } from "./readJsonBody";
import { parseUploadInput } from "./parseUploadInput";
import { json, type HttpResponse } from "./httpResponse";

// HTTP(API Gateway) とユースケースの橋渡し。
// 画像アップロード用の署名付き PUT URL を発行する。編集系と同じく "editor" グループ
// 所属を必須にする（未所属は 403）。認証（ログイン済みか）は Authorizer が手前で担保。
export class UploadController {
  constructor(private readonly createUploadUrl: CreateUploadUrl) {}

  async create(
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
  ): Promise<HttpResponse> {
    const denied = requireEditor(event);
    if (denied) return denied;

    const body = readJsonBody(event);
    if (!body.ok) return json(400, { message: "invalid JSON body" });

    const parsed = parseUploadInput(body.value);
    if (!parsed.ok) return json(400, { message: parsed.error });

    const result = await this.createUploadUrl.execute(parsed.value.contentType);
    if (!result.ok) {
      return json(400, { message: `unsupported contentType: ${parsed.value.contentType}` });
    }
    return json(200, result.ticket);
  }
}
