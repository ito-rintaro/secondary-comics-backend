import { S3Client } from "@aws-sdk/client-s3";

// S3 クライアントを生成する。
// @aws-sdk/client-s3 は nodejs22.x runtime に同梱されているので追加インストール不要。
export const createS3Client = (): S3Client => new S3Client({});
