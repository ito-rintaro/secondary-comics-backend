import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// DynamoDB の DocumentClient を生成する。
// AWS SDK v3 は nodejs22.x runtime に同梱されているので追加インストール不要。
export const createDocumentClient = (): DynamoDBDocumentClient =>
  DynamoDBDocumentClient.from(new DynamoDBClient({}));
