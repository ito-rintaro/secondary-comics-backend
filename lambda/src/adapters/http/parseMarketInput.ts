import type { MarketInput } from "../../application/ports/MarketRepository";
import type { Condition } from "../../domain/collection/Condition";

// POST /market・PUT /market/{id} のボディを検証して MarketInput に整える。
// 必須は catalogId / condition / history（12 要素）。seller は未指定なら空文字。
// price / change / listedAt は受け取らない（保存側で導出・採番する）。
const CONDITIONS: readonly Condition[] = ["S", "A", "B", "C"];
const HISTORY_LENGTH = 12;

export type ParseResult =
  | { ok: true; value: MarketInput }
  | { ok: false; error: string };

const strOr = (v: unknown): string | null => {
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : null;
};

export const parseMarketInput = (body: unknown): ParseResult => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.catalogId !== "string" || b.catalogId.length === 0) {
    return { ok: false, error: "catalogId is required" };
  }
  if (!CONDITIONS.includes(b.condition as Condition)) {
    return {
      ok: false,
      error: `condition must be one of ${CONDITIONS.join("/")}`,
    };
  }

  const seller = strOr(b.seller);
  if (seller === null) return { ok: false, error: "seller must be a string" };

  if (!Array.isArray(b.history) || b.history.length !== HISTORY_LENGTH) {
    return {
      ok: false,
      error: `history must be an array of exactly ${HISTORY_LENGTH} numbers`,
    };
  }
  const history: number[] = [];
  for (const n of b.history) {
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      return { ok: false, error: "history must contain non-negative integers" };
    }
    history.push(n);
  }

  return {
    ok: true,
    value: {
      catalogId: b.catalogId,
      seller,
      condition: b.condition as Condition,
      history,
    },
  };
};
