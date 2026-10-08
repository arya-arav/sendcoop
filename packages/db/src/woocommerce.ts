import type { PostbackStatus } from "./postback-params";
import { verifyShopifyHmac } from "./shopify";

// WooCommerce order webhooks (D49). The merchant adds webhooks in
// WooCommerce > Settings > Advanced > Webhooks ("Order created" and "Order
// updated") with our URL and the secret we show. The Sendcoop plugin saves
// the click id from the email link on the order as "sc_cid" meta (no
// leading underscore: WooCommerce leaves those out of webhooks).

/** X-WC-Webhook-Signature: base64 HMAC-SHA256 of the raw body, as Shopify does. */
export const verifyWooSignature = verifyShopifyHmac;

/** Order ids are per store, so the store's address is part of ours. */
export const wooTxid = (source: string | null, orderId: string | number) =>
  `woocommerce:${source ? source.replace(/^https?:\/\//, "").replace(/\/+$/, "") : "store"}:${orderId}`;

const STATUS: Record<string, PostbackStatus> = {
  pending: "pending", // awaiting payment
  "on-hold": "pending",
  processing: "approved",
  completed: "approved",
  cancelled: "rejected",
  failed: "rejected",
  refunded: "reversed",
};

export type WooOrder = {
  txid: string;
  clickId: string | null;
  email: string | null;
  value: number;
  currency: string;
  status: PostbackStatus;
  occurredAt: Date | undefined;
  refunds: { refundId: string; amount: number }[];
};

const amount = (value: unknown) => {
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) / 100 : null;
};

/** An order.created / order.updated payload (WooCommerce REST API order); null if it isn't one. */
export function parseWooOrder(order: unknown, source: string | null): WooOrder | null {
  if (!order || typeof order !== "object") return null;
  const o = order as Record<string, unknown>;
  if (typeof o.id !== "number" && typeof o.id !== "string") return null;
  const meta = Array.isArray(o.meta_data)
    ? (o.meta_data as { key?: unknown; value?: unknown }[])
    : [];
  const clickId = meta.find((m) => m?.key === "sc_cid")?.value;
  const billing = (o.billing ?? {}) as Record<string, unknown>;
  const email =
    typeof billing.email === "string" && billing.email.includes("@") ? billing.email : null;
  const created =
    typeof o.date_created_gmt === "string" ? new Date(`${o.date_created_gmt}Z`) : undefined;
  const refunds = Array.isArray(o.refunds)
    ? (o.refunds as { id?: unknown; total?: unknown }[])
    : [];
  return {
    txid: wooTxid(source, o.id),
    clickId: typeof clickId === "string" && /^[\w-]{4,64}$/.test(clickId) ? clickId : null,
    email: email?.trim().toLowerCase().slice(0, 254) ?? null,
    value: amount(o.total) ?? 0,
    currency: typeof o.currency === "string" && /^[A-Z]{3}$/.test(o.currency) ? o.currency : "USD",
    status: STATUS[typeof o.status === "string" ? o.status : ""] ?? "pending",
    occurredAt: created && !Number.isNaN(created.getTime()) ? created : undefined,
    refunds: refunds
      .filter((r) => r?.id !== undefined && amount(r.total))
      .map((r) => ({ refundId: String(r.id), amount: amount(r.total)! })),
  };
}
