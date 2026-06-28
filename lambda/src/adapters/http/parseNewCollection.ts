import type { CreateCollectionInput } from "../../application/usecases/CreateCollection";
import type { Condition } from "../../domain/collection/Condition";
import type { MarketSource } from "../../domain/collection/MarketSource";

// POST /collection のリクエストボディを検証して CreateCollectionInput に整える。
// 必須: catalogId / condition。他は既定値で補完する（contract は AskUser で確定）。
const CONDITIONS: readonly Condition[] = ["S", "A", "B", "C"];
const MARKET_SOURCES: readonly MarketSource[] = ["manual", "auto", "estimate"];

export type ParseResult =
  | { ok: true; value: CreateCollectionInput }
  | { ok: false; error: string };

// 未指定なら fallback。数値かつ非負なら整数に丸めて返す。型不正は null。
const intOr = (v: unknown, fallback: number): number | null => {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.trunc(v);
};

// 未指定なら空文字。文字列ならそのまま。型不正は null。
const strOr = (v: unknown): string | null => {
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : null;
};

export const parseNewCollection = (body: unknown): ParseResult => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.catalogId !== "string" || b.catalogId.length === 0) {
    return { ok: false, error: "catalogId is required" };
  }
  if (!CONDITIONS.includes(b.condition as Condition)) {
    return { ok: false, error: `condition must be one of ${CONDITIONS.join("/")}` };
  }

  let marketSource: MarketSource = "manual";
  if (b.marketSource !== undefined && b.marketSource !== null) {
    if (!MARKET_SOURCES.includes(b.marketSource as MarketSource)) {
      return {
        ok: false,
        error: `marketSource must be one of ${MARKET_SOURCES.join("/")}`,
      };
    }
    marketSource = b.marketSource as MarketSource;
  }

  const qty = intOr(b.qty, 1);
  const cost = intOr(b.cost, 0);
  const market = intOr(b.market, 0);
  if (qty === null || qty < 1) {
    return { ok: false, error: "qty must be an integer >= 1" };
  }
  if (cost === null) return { ok: false, error: "cost must be a non-negative integer" };
  if (market === null) {
    return { ok: false, error: "market must be a non-negative integer" };
  }

  const purchaseDate = strOr(b.purchaseDate);
  const store = strOr(b.store);
  const location = strOr(b.location);
  const memo = strOr(b.memo);
  if (purchaseDate === null) return { ok: false, error: "purchaseDate must be a string" };
  if (store === null) return { ok: false, error: "store must be a string" };
  if (location === null) return { ok: false, error: "location must be a string" };
  if (memo === null) return { ok: false, error: "memo must be a string" };

  return {
    ok: true,
    value: {
      catalogId: b.catalogId,
      condition: b.condition as Condition,
      qty,
      cost,
      market,
      marketSource,
      purchaseDate,
      store,
      location,
      memo,
    },
  };
};
