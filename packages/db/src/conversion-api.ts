import { createHmac, timingSafeEqual } from "node:crypto";
import { type PostbackEvent, type PostbackStatus, parseStatus } from "./postback-params";

// The server-side conversion API (D47): POST /v1/conversions on the tracking
// domain, signed like Stripe's webhooks so the secret never travels:
//
//   Sendcoop-Workspace: <workspace id>
//   Sendcoop-Timestamp: <unix seconds>
//   Sendcoop-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<body>" with the API secret>
//
// The timestamp is signed too, so a captured request can't be replayed
// after five minutes; within them, order ids make repeats harmless.

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signConversionBody(secret: string, timestamp: string | number, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifyConversionSignature(input: {
  secret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  body: string;
  now?: number;
}): "ok" | "missing" | "expired" | "invalid" {
  const { secret, timestamp, signature, body, now = Date.now() } = input;
  if (!timestamp || !signature) return "missing";
  if (!/^\d{9,11}$/.test(timestamp)) return "invalid";
  if (Math.abs(now / 1000 - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return "expired";
  const expected = Buffer.from(signConversionBody(secret, timestamp, body));
  const given = Buffer.from(signature.trim().toLowerCase());
  return given.length === expected.length && timingSafeEqual(given, expected) ? "ok" : "invalid";
}

export type ApiConversion = {
  clickId: string | null;
  email: string | null;
  event: PostbackEvent;
  value: number;
  currency: string;
  status: PostbackStatus;
  txid: string | null;
  occurredAt: Date | undefined;
};

const EVENTS = ["sale", "lead", "signup", "custom"] as const;
const STATUSES = ["pending", "approved", "rejected", "reversed"] as const;
const YEAR = 365 * 86_400_000;

/** The request body, checked field by field; errors say which field and why. */
export function parseApiConversion(
  body: unknown,
  now = Date.now(),
): { ok: true; conversion: ApiConversion } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "The body must be a JSON object." };
  }
  const data = body as Record<string, unknown>;
  const fail = (error: string) => ({ ok: false as const, error });
  const optionalText = (name: string, max: number) => {
    const value = data[name];
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" && typeof value !== "number") return undefined;
    const text = String(value).trim();
    return text.length > max ? undefined : text || null;
  };

  const clickId = optionalText("click_id", 64);
  if (clickId === undefined || (clickId && !/^[\w-]{4,64}$/.test(clickId))) {
    return fail("click_id must be the sc_cid value from the link, e.g. sc4Fh9KqZ2LmPx7Ty1.");
  }
  const rawEmail = optionalText("email", 254);
  const email = rawEmail ? rawEmail.toLowerCase() : rawEmail;
  if (email === undefined || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return fail("email must be an email address.");
  }
  const event = data.event ?? "sale";
  if (!EVENTS.includes(event as PostbackEvent))
    return fail(`event must be one of ${EVENTS.join(", ")}.`);
  const value = data.value ?? 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1e9) {
    return fail("value must be a number from 0, e.g. 49.99 (refunds: status reversed).");
  }
  const currency = data.currency ?? "USD";
  if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency)) {
    return fail("currency must be a three-letter code, e.g. USD.");
  }
  const rawStatus = data.status ?? "approved";
  if (typeof rawStatus !== "string") return fail(`status must be one of ${STATUSES.join(", ")}.`);
  const status = STATUSES.includes(rawStatus as PostbackStatus)
    ? (rawStatus as PostbackStatus)
    : /^(refund(ed)?|chargeback)$/i.test(rawStatus)
      ? parseStatus(rawStatus)
      : null;
  if (!status) return fail(`status must be one of ${STATUSES.join(", ")}.`);
  const txid = optionalText("order_id", 200);
  if (txid === undefined) return fail("order_id must be a string of up to 200 characters.");

  let occurredAt: Date | undefined;
  if (data.occurred_at !== undefined && data.occurred_at !== null) {
    occurredAt = new Date(String(data.occurred_at));
    const time = occurredAt.getTime();
    if (typeof data.occurred_at !== "string" || Number.isNaN(time)) {
      return fail("occurred_at must be an ISO 8601 time, e.g. 2026-10-08T14:30:00Z.");
    }
    if (time > now + 3_600_000 || time < now - YEAR) {
      return fail("occurred_at must be within the past year.");
    }
  }

  return {
    ok: true,
    conversion: {
      clickId,
      email,
      event: event as PostbackEvent,
      value: Math.round(value * 100) / 100,
      currency: currency.toUpperCase(),
      status,
      txid,
      occurredAt,
    },
  };
}
