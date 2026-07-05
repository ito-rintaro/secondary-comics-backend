import { build } from "esbuild";

// src/handler.ts を dist/index.mjs に 1 ファイルへバンドルする。
// DynamoDB / S3 のクライアントは nodejs22.x runtime に同梱されているため external。
// ただし @aws-sdk/s3-request-presigner は runtime 同梱が保証されないため、
// これと配下の依存（@smithy/* 等）はバンドルに含める（external から外す）。
await build({
  entryPoints: ["src/handler.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  external: [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/client-s3",
  ],
});

console.log("built dist/index.mjs");
