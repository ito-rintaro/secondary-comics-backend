// 環境変数の読み取りを一元化する。未設定なら起動時に落として早期に気づけるようにする。
export interface Env {
  appTableName: string;
  marketTableName: string;
  assetsBucketName: string;
}

export const loadEnv = (): Env => {
  const appTableName = process.env.APP_TABLE_NAME;
  if (!appTableName) {
    throw new Error("APP_TABLE_NAME environment variable is not set");
  }
  const marketTableName = process.env.MARKET_TABLE_NAME;
  if (!marketTableName) {
    throw new Error("MARKET_TABLE_NAME environment variable is not set");
  }
  const assetsBucketName = process.env.ASSETS_BUCKET_NAME;
  if (!assetsBucketName) {
    throw new Error("ASSETS_BUCKET_NAME environment variable is not set");
  }
  return { appTableName, marketTableName, assetsBucketName };
};
