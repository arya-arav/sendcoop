// Browser-safe. What sc.js (or anything else) sends to /px: untrusted JSON
// from a visitor's browser, so every field is checked and bounded.

import {
  type PostbackEvent,
  type PostbackStatus,
  parseAmount,
  parseStatus,
} from "./postback-params";

export type PixelEvent = {
  key: string;
  clickId: string | null;
  email: string | null;
  event: PostbackEvent;
  value: number;
  currency: string;
  status: PostbackStatus;
  txid: string | null;
  url: string | null;
};

const text = (value: unknown, max: number) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim().slice(0, max) || null
    : null;

/** null when there's no key: nothing to record it under. */
export function parsePixelEvent(body: unknown): PixelEvent | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const data = body as Record<string, unknown>;
  const key = text(data.key, 64);
  if (!key) return null;
  const clickId = text(data.cid, 64);
  const email = text(data.email, 254)?.toLowerCase() ?? null;
  const currency = text(data.currency, 10)?.toUpperCase();
  const event = text(data.event, 10);
  const url = text(data.url, 2000);
  return {
    key,
    clickId: clickId && /^[\w-]{4,64}$/.test(clickId) ? clickId : null,
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    event: event === "lead" || event === "signup" || event === "custom" ? event : "sale",
    // Negative values aren't refunds from a browser: those come from the store's server.
    value: Math.max(0, parseAmount(text(data.value, 30)) ?? 0),
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD",
    status: parseStatus(text(data.status, 20)) === "pending" ? "pending" : "approved",
    txid: text(data.order_id, 200),
    url: url && /^https?:\/\//i.test(url) ? url : null,
  };
}
