import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseShopifyOrder, parseShopifyRefund, verifyShopifyHmac } from "./shopify";

// Trimmed from Shopify's sample orders/create and refunds/create payloads.
const ORDER = {
  id: 820982911946154500,
  name: "#9999",
  email: "Jon@Example.com",
  created_at: "2026-10-07T12:30:00-04:00",
  currency: "USD",
  financial_status: "paid",
  total_price: "403.00",
  landing_site: "/products/boots?utm_source=newsletter&sc_cid=scLandingSite00000",
  note_attributes: [
    { name: "gift", value: "no" },
    { name: "sc_cid", value: "sc4Fh9KqZ2LmPx7Ty1" },
  ],
  customer: { email: "jon@example.com" },
};

describe("verifyShopifyHmac", () => {
  const body = JSON.stringify(ORDER);
  const header = createHmac("sha256", "whsec").update(body).digest("base64");

  it("accepts Shopify's base64 signature of the raw body", () => {
    expect(verifyShopifyHmac("whsec", body, header)).toBe(true);
  });

  it("refuses other bodies, secrets and missing headers", () => {
    expect(verifyShopifyHmac("whsec", body.replace("403.00", "4.00"), header)).toBe(false);
    expect(verifyShopifyHmac("other", body, header)).toBe(false);
    expect(verifyShopifyHmac("whsec", body, undefined)).toBe(false);
  });
});

describe("parseShopifyOrder", () => {
  it("reads the order, with the click id from the cart attributes", () => {
    expect(parseShopifyOrder(ORDER)).toEqual({
      txid: "shopify:820982911946154500",
      clickId: "sc4Fh9KqZ2LmPx7Ty1",
      email: "jon@example.com",
      value: 403,
      currency: "USD",
      status: "approved",
      occurredAt: new Date("2026-10-07T16:30:00Z"),
    });
  });

  it("falls back to the landing page's sc_cid, then to none", () => {
    expect(parseShopifyOrder({ ...ORDER, note_attributes: [] })?.clickId).toBe(
      "scLandingSite00000",
    );
    expect(
      parseShopifyOrder({ ...ORDER, note_attributes: [], landing_site: "/" })?.clickId,
    ).toBeNull();
  });

  it("maps payment states", () => {
    expect(parseShopifyOrder({ ...ORDER, financial_status: "pending" })?.status).toBe("pending");
    expect(parseShopifyOrder({ ...ORDER, financial_status: "authorized" })?.status).toBe(
      "approved",
    );
    expect(parseShopifyOrder({ ...ORDER, financial_status: "voided" })?.status).toBe("rejected");
  });

  it("isn't fooled by other payloads", () => {
    expect(parseShopifyOrder({ name: "#1" })).toBeNull();
    expect(parseShopifyOrder(null)).toBeNull();
  });
});

describe("parseShopifyRefund", () => {
  it("adds up the successful refund transactions", () => {
    expect(
      parseShopifyRefund({
        id: 929361462,
        order_id: 820982911946154500,
        transactions: [
          { kind: "refund", status: "success", amount: "100.00" },
          { kind: "refund", status: "failure", amount: "50.00" },
          { kind: "refund", status: "success", amount: "3.00" },
        ],
      }),
    ).toEqual({ txid: "shopify:820982911946154500", refundId: "929361462", amount: 103 });
  });
});
