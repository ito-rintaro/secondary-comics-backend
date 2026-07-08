import type { MarketInput } from "../../application/ports/MarketRepository";

// POST /market・PUT /market/{id} のボディを検証して MarketInput（成約 1 件）に整える。
// 必須は catalogId / price / soldAt。condition（鑑定記録）と seller は未指定なら空文字。
// condition は取り得る種類が未確定のため、任意の自由文字列を許容する（enum 検証はしない）。
// id / listedAt は受け取らない（保存側で採番する）。相場（history/change）は集計側で導出。

export type ParseResult =
  | { ok: true; value: MarketInput }
  | { ok: false; error: string };

const strOr = (v: unknown): string | null => {
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : null;
};

// "YYYY-MM-DD" 形式かつ実在する暦日か（例: 2026-02-31 は弾く）。未来日は許容する。
const isValidDate = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (daysInMonth[month - 1] ?? 31);
};

export const parseMarketInput = (body: unknown): ParseResult => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.catalogId !== "string" || b.catalogId.length === 0) {
    return { ok: false, error: "catalogId is required" };
  }

  const condition = strOr(b.condition);
  if (condition === null) {
    return { ok: false, error: "condition must be a string" };
  }

  if (
    typeof b.price !== "number" ||
    !Number.isInteger(b.price) ||
    b.price < 0
  ) {
    return { ok: false, error: "price must be a non-negative integer" };
  }

  if (typeof b.soldAt !== "string" || !isValidDate(b.soldAt)) {
    return { ok: false, error: "soldAt must be a valid date in YYYY-MM-DD" };
  }

  const seller = strOr(b.seller);
  if (seller === null) return { ok: false, error: "seller must be a string" };

  return {
    ok: true,
    value: {
      catalogId: b.catalogId,
      condition,
      price: b.price,
      soldAt: b.soldAt,
      seller,
    },
  };
};
