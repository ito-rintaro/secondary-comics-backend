// 画像を直接アップロードするための署名付き URL を発行するポート（出力ポート）。
// 実装は adapters/persistence/s3 に置く。usecase はこの interface だけに依存し、
// S3 / 署名の具体を知らない。
export interface PresignedUploadStore {
  // 指定キー・ContentType でオブジェクトを PUT するための署名付き URL を発行する。
  // 返す URL に、署名時と同じ Content-Type を付けて画像バイトを PUT する。
  issuePutUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string>;
}
