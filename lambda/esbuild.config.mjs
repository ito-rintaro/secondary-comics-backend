import { build } from "esbuild";

// src/handler.ts を dist/index.mjs に 1 ファイルへバンドルする。
// AWS SDK v3 は nodejs22.x runtime に同梱されているため external にして同梱しない。
await build({
  entryPoints: ["src/handler.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  external: ["@aws-sdk/*"],
});

console.log("built dist/index.mjs");
