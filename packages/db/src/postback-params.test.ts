import { describe, expect, it } from "vitest";
import { ipAllowed, parseAmount, parsePostback, parseStatus } from "./postback-params";

describe("parsePostback", () => {
  it("reads the common names networks use", () => {
    expect(
      parsePostback({ CID: "sc4Fh9KqZ2LmPx7Ty1", payout: "12.50", TXID: "T-1", currency: "eur" }),
    ).toEqual({
      clickId: "sc4Fh9KqZ2LmPx7Ty1",
      value: 12.5,
      currency: "EUR",
      status: "approved",
      event: "sale",
      txid: "T-1",
      network: null,
    });
    expect(
      parsePostback({ aff_sub: "scX", amount: "$1,234.50", transaction_id: "9", event: "lead" }),
    ).toMatchObject({
      clickId: "scX",
      value: 1234.5,
      txid: "9",
      event: "lead",
    });
  });

  it("treats unfilled macros as missing", () => {
    expect(parsePostback({ cid: "{subid}", payout: "[payout]", txid: "#txid#" })).toMatchObject({
      clickId: null,
      value: 0,
      txid: null,
    });
  });

  it("turns a negative payout into a reversal of that amount", () => {
    expect(parsePostback({ cid: "sc1", payout: "-20" })).toMatchObject({
      status: "reversed",
      value: 20,
    });
  });
});

describe("parseStatus and parseAmount", () => {
  it.each([
    ["approved", "approved"],
    ["1", "approved"],
    ["pending", "pending"],
    ["Declined", "rejected"],
    ["chargeback", "reversed"],
    ["refunded", "reversed"],
    [null, "approved"],
    ["something-else", "approved"],
  ])("%s -> %s", (raw, status) => {
    expect(parseStatus(raw)).toBe(status);
  });

  it("reads amounts with symbols, commas and decimal commas", () => {
    expect(parseAmount("12,50")).toBe(12.5);
    expect(parseAmount("$12.50")).toBe(12.5);
    expect(parseAmount("$1,500")).toBe(1500);
    expect(parseAmount("1,234.50")).toBe(1234.5);
    expect(parseAmount("1.234,50 €")).toBe(1234.5);
    expect(parseAmount("-20.00")).toBe(-20);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
});

describe("ipAllowed", () => {
  it("allows everyone with an empty list, otherwise exact IPs and IPv4 ranges", () => {
    expect(ipAllowed("1.2.3.4", [])).toBe(true);
    expect(ipAllowed("203.0.113.9", ["203.0.113.0/24"])).toBe(true);
    expect(ipAllowed("::ffff:203.0.113.9", ["203.0.113.9"])).toBe(true);
    expect(ipAllowed("198.51.100.1", ["203.0.113.0/24", "192.0.2.1"])).toBe(false);
    expect(ipAllowed(null, ["203.0.113.0/24"])).toBe(false);
  });
});
