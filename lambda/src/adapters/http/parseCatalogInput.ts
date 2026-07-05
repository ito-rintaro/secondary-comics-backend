import type { CatalogInput } from "../../application/ports/CatalogRepository";
import type { ConditionFlags } from "../../domain/collection/ConditionFlags";

// POST /catalogs・PUT /catalogs/{id} のボディを検証して CatalogInput に整える。
// 必須は title のみ。他の文字列は未指定なら空文字、flags は未指定なら全 false で補完。
export type ParseResult =
  | { ok: true; value: CatalogInput }
  | { ok: false; error: string };

// 未指定なら空文字。文字列ならそのまま。型不正は null。
const strOr = (v: unknown): string | null => {
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : null;
};

// flags を検証する。未指定なら全 false。各キーは boolean（未指定は false）。型不正は null。
const parseFlags = (v: unknown): ConditionFlags | null => {
  if (v === undefined || v === null) {
    return { firstEd: false, obi: false, special: false };
  }
  if (typeof v !== "object" || Array.isArray(v)) return null;
  const f = v as Record<string, unknown>;
  const bool = (x: unknown): boolean | null =>
    x === undefined ? false : typeof x === "boolean" ? x : null;
  const firstEd = bool(f.firstEd);
  const obi = bool(f.obi);
  const special = bool(f.special);
  if (firstEd === null || obi === null || special === null) return null;
  return { firstEd, obi, special };
};

export const parseCatalogInput = (body: unknown): ParseResult => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.title !== "string" || b.title.length === 0) {
    return { ok: false, error: "title is required" };
  }

  const author = strOr(b.author);
  const publisher = strOr(b.publisher);
  const volume = strOr(b.volume);
  const year = strOr(b.year);
  const imageUrl = strOr(b.imageUrl);
  if (
    author === null ||
    publisher === null ||
    volume === null ||
    year === null ||
    imageUrl === null
  ) {
    return {
      ok: false,
      error: "author/publisher/volume/year/imageUrl must be strings",
    };
  }

  const flags = parseFlags(b.flags);
  if (flags === null) {
    return {
      ok: false,
      error: "flags must be an object of booleans {firstEd,obi,special}",
    };
  }

  return {
    ok: true,
    value: { title: b.title, author, publisher, volume, year, flags, imageUrl },
  };
};
