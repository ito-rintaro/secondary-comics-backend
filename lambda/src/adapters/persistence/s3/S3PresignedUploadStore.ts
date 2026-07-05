import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PresignedUploadStore } from "../../../application/ports/PresignedUploadStore";

// S3 の images/ 配下へ直接 PUT するための署名付き URL を発行する実装。
// キーは images/<key>（<key> は usecase が採番した "<uuid>.<ext>"）。
// 署名時に付けた ContentType と同じ Content-Type を、ブラウザは PUT 時に送る必要がある。
const KEY_PREFIX = "images/";

export class S3PresignedUploadStore implements PresignedUploadStore {
  constructor(
    private readonly s3: S3Client,
    private readonly bucketName: string,
  ) {}

  issuePutUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: `${KEY_PREFIX}${key}`,
      ContentType: contentType,
    });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }
}
