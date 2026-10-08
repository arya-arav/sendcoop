import { describe, expect, it } from "vitest";
import { parsePixelEvent } from "./pixel-params";

describe("parsePixelEvent", () => {
  it("reads a sale from sc.js", () => {
    expect(
      parsePixelEvent({
        key: "px_abc",
        cid: "sc4Fh9KqZ2LmPx7Ty1",
        event: "sale",
        value: 49.9,
        currency: "eur",
        order_id: 1042,
        email: " Buyer@Example.com ",
        url: "https://shop.example/thanks",
      }),
    ).toEqual({
      key: "px_abc",
      clickId: "sc4Fh9KqZ2LmPx7Ty1",
      email: "buyer@example.com",
      event: "sale",
      value: 49.9,
      currency: "EUR",
      status: "approved",
      txid: "1042",
      url: "https://shop.example/thanks",
    });
  });

  it("needs a key", () => {
    expect(parsePixelEvent({ value: 10 })).toBeNull();
    expect(parsePixelEvent(null)).toBeNull();
    expect(parsePixelEvent("px_abc")).toBeNull();
    expect(parsePixelEvent([{ key: "px_abc" }])).toBeNull();
  });

  it("drops what doesn't look right instead of storing it", () => {
    expect(
      parsePixelEvent({
        key: "px_abc",
        cid: "<script>",
        email: "not an email",
        event: "refund",
        value: "-20",
        currency: "dollars",
        status: "refunded",
        url: "javascript:alert(1)",
        order_id: { id: 1 },
      }),
    ).toMatchObject({
      clickId: null,
      email: null,
      event: "sale",
      value: 0,
      currency: "USD",
      status: "approved",
      url: null,
      txid: null,
    });
  });

  it("accepts leads, string amounts and pending status", () => {
    expect(
      parsePixelEvent({ key: "px_abc", event: "lead", value: "$1,250.00", status: "pending" }),
    ).toMatchObject({ event: "lead", value: 1250, status: "pending" });
  });
});
