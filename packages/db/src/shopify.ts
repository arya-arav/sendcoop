import { createHmac, timingSafeEqual } from "node:crypto";
import type { PostbackStatus } from "./postback-params";

// Shopify order webhooks (D48). The merchant adds two webhooks in their
// admin (Settings > Notifications > Webhooks: "Order creation" and "Refund
// create", JSON) pointing at our URL. Shopify signs each body with the
// signing secret shown on that page; the merchant gives it to us.
//
// The click id reaches the order as a cart attribute: sc.js copies its
// sc_cid cookie into the cart on Shopify stores, and Shopify puts cart
// attributes on the order as note_attributes.

/** X-Shopify-Hmac-Sha256: base64 HMAC-SHA256 of the raw body. */
export function verifyShopifyHmac(secret: string, body: string, header: string | undefined) {
  if (!header) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body, "utf8").digest("base64"));
  const given = Buffer.from(header.trim());
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const shopifyTxid = (orderId: string | number) => `shopify:${orderId}`;

const CLICK_ID = /^[\w-]{4,64}$/;

type Attribute = { name?: unknown; value?: unknown };

function clickIdFrom(order: Record<string, unknown>) {
  const attributes = Array.isArray(order.note_attributes)
    ? (order.note_attributes as Attribute[])
    : [];
  const fromCart = attributes.find((a) => a?.name === "sc_cid")?.value;
  if (typeof fromCart === "string" && CLICK_ID.test(fromCart)) return fromCart;
  // The first page of the visit, when the cart attribute didn't make it.
  if (typeof order.landing_site === "string") {
    const match = order.landing_site.match(/[?&]sc_cid=([\w-]{4,64})/);
    if (match) return match[1]!;
  }
  return null;
}

const amount = (value: unknown) => {
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

export type ShopifyOrder = {
  txid: string;
  clickId: string | null;
  email: string | null;
  value: number;
  currency: string;
  status: PostbackStatus;
  occurredAt: Date | undefined;
};

/** The orders/create payload; null when it isn't an order. */
export function parseShopifyOrder(order: unknown): ShopifyOrder | null {
  if (!order || typeof order !== "object") return null;
  const o = order as Record<string, unknown>;
  if (typeof o.id !== "number" && typeof o.id !== "string") return null;
  const customer = (o.customer ?? {}) as Record<string, unknown>;
  const email = [o.email, o.contact_email, customer.email].find(
    (e): e is string => typeof e === "string" && e.includes("@"),
  );
  const financial = typeof o.financial_status === "string" ? o.financial_status : "paid";
  const created = typeof o.created_at === "string" ? new Date(o.created_at) : undefined;
  return {
    txid: shopifyTxid(o.id),
    clickId: clickIdFrom(o),
    email: email?.trim().toLowerCase().slice(0, 254) ?? null,
    // The shop's currency, as reports add revenue up per shop.
    value: amount(o.total_price) ?? 0,
    currency: typeof o.currency === "string" && /^[A-Z]{3}$/.test(o.currency) ? o.currency : "USD",
    status:
      financial === "pending"
        ? "pending"
        : financial === "voided"
          ? "rejected"
          : financial === "refunded"
            ? "reversed"
            : "approved",
    occurredAt: created && !Number.isNaN(created.getTime()) ? created : undefined,
  };
}

export type ShopifyRefund = { txid: string; refundId: string; amount: number };

/** The refunds/create payload: how much went back to the buyer. */
export function parseShopifyRefund(refund: unknown): ShopifyRefund | null {
  if (!refund || typeof refund !== "object") return null;
  const r = refund as Record<string, unknown>;
  if (r.id === undefined || r.order_id === undefined) return null;
  const transactions = Array.isArray(r.transactions)
    ? (r.transactions as Record<string, unknown>[])
    : [];
  const refunded = transactions
    .filter((t) => t?.kind === "refund" && t?.status === "success")
    .reduce((sum, t) => sum + (amount(t.amount) ?? 0), 0);
  return {
    txid: shopifyTxid(r.order_id as string | number),
    refundId: String(r.id),
    amount: Math.round(refunded * 100) / 100,
  };
}
