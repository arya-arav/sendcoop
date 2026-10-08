import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWooOrder, verifyWooSignature, wooTxid } from "./woocommerce";

// Trimmed from a WooCommerce order.created webhook body.
const ORDER = {
  id: 727,
  number: "727",
  status: "processing",
  currency: "EUR",
  date_created_gmt: "2026-10-07T10:15:00",
  total: "29.35",
  billing: { first_name: "John", email: "John.Doe@Example.com" },
  meta_data: [
    { id: 1, key: "is_vat_exempt", value: "no" },
    { id: 2, key: "sc_cid", value: "sc4Fh9KqZ2LmPx7Ty1" },
  ],
  refunds: [],
};

describe("parseWooOrder", () => {
  it("reads the order, with the click id the plugin saved", () => {
    expect(parseWooOrder(ORDER, "https://shop.example/")).toEqual({
      txid: "woocommerce:shop.example:727",
      clickId: "sc4Fh9KqZ2LmPx7Ty1",
      email: "john.doe@example.com",
      value: 29.35,
      currency: "EUR",
      status: "approved",
      occurredAt: new Date("2026-10-07T10:15:00Z"),
      refunds: [],
    });
  });

  it("maps order statuses", () => {
    const status = (s: string) => parseWooOrder({ ...ORDER, status: s }, null)?.status;
    expect(status("pending")).toBe("pending");
    expect(status("on-hold")).toBe("pending");
    expect(status("completed")).toBe("approved");
    expect(status("cancelled")).toBe("rejected");
    expect(status("failed")).toBe("rejected");
    expect(status("refunded")).toBe("reversed");
    expect(status("checkout-draft")).toBe("pending");
  });

  it("lists refunds (negative totals in WooCommerce)", () => {
    expect(
      parseWooOrder({ ...ORDER, refunds: [{ id: 801, reason: "", total: "-10.00" }] }, null)
        ?.refunds,
    ).toEqual([{ refundId: "801", amount: 10 }]);
  });

  it("does without a click id, and refuses non-orders", () => {
    expect(parseWooOrder({ ...ORDER, meta_data: [] }, null)?.clickId).toBeNull();
    expect(parseWooOrder({ webhook_id: 3 }, null)).toBeNull();
  });

  it("keeps stores apart in transaction ids", () => {
    expect(wooTxid("http://a.example", 1)).not.toBe(wooTxid("http://b.example", 1));
    expect(wooTxid(null, 1)).toBe("woocommerce:store:1");
  });
});

describe("verifyWooSignature", () => {
  it("checks the base64 HMAC-SHA256 of the body", () => {
    const body = JSON.stringify(ORDER);
    const signature = createHmac("sha256", "wcsecret").update(body).digest("base64");
    expect(verifyWooSignature("wcsecret", body, signature)).toBe(true);
    expect(verifyWooSignature("other", body, signature)).toBe(false);
  });
});
