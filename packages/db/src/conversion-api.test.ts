import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseApiConversion,
  signConversionBody,
  verifyConversionSignature,
} from "./conversion-api";

const SECRET = "sk_TESTSECRET";
const NOW = Date.UTC(2026, 9, 8, 12);
const TS = String(NOW / 1000);
const BODY = '{"value":49.99}';

describe("conversion API signatures", () => {
  it("is HMAC-SHA256 of timestamp.body, as openssl computes it in the docs", () => {
    const hex = createHmac("sha256", SECRET).update(`${TS}.${BODY}`).digest("hex");
    expect(signConversionBody(SECRET, TS, BODY)).toBe(`sha256=${hex}`);
  });

  it("accepts a fresh, correct signature", () => {
    const signature = signConversionBody(SECRET, TS, BODY);
    expect(
      verifyConversionSignature({ secret: SECRET, timestamp: TS, signature, body: BODY, now: NOW }),
    ).toBe("ok");
    // Within the tolerance, either way (clock skew)
    expect(
      verifyConversionSignature({
        secret: SECRET,
        timestamp: TS,
        signature,
        body: BODY,
        now: NOW + 299_000,
      }),
    ).toBe("ok");
  });

  it("refuses changed bodies, other secrets, old timestamps and missing headers", () => {
    const signature = signConversionBody(SECRET, TS, BODY);
    const check = (over: Partial<Parameters<typeof verifyConversionSignature>[0]>) =>
      verifyConversionSignature({
        secret: SECRET,
        timestamp: TS,
        signature,
        body: BODY,
        now: NOW,
        ...over,
      });
    expect(check({ body: '{"value":4999}' })).toBe("invalid");
    expect(check({ secret: "sk_OTHER" })).toBe("invalid");
    expect(check({ signature: signature.slice(0, -1) })).toBe("invalid");
    expect(check({ timestamp: "12ab" })).toBe("invalid");
    expect(check({ now: NOW + 301_000 })).toBe("expired");
    expect(check({ timestamp: undefined })).toBe("missing");
    expect(check({ signature: undefined })).toBe("missing");
  });
});

describe("parseApiConversion", () => {
  it("reads a full conversion", () => {
    expect(
      parseApiConversion(
        {
          click_id: "sc4Fh9KqZ2LmPx7Ty1",
          email: "Buyer@Example.com",
          event: "sale",
          value: 49.999,
          currency: "eur",
          status: "approved",
          order_id: 1042,
          occurred_at: "2026-10-07T09:00:00Z",
        },
        NOW,
      ),
    ).toEqual({
      ok: true,
      conversion: {
        clickId: "sc4Fh9KqZ2LmPx7Ty1",
        email: "buyer@example.com",
        event: "sale",
        value: 50,
        currency: "EUR",
        status: "approved",
        txid: "1042",
        occurredAt: new Date("2026-10-07T09:00:00Z"),
      },
    });
  });

  it("has defaults for a bare sale", () => {
    expect(parseApiConversion({}, NOW)).toEqual({
      ok: true,
      conversion: {
        clickId: null,
        email: null,
        event: "sale",
        value: 0,
        currency: "USD",
        status: "approved",
        txid: null,
        occurredAt: undefined,
      },
    });
  });

  it("accepts refunds", () => {
    expect(parseApiConversion({ order_id: "1042", status: "refunded" }, NOW)).toMatchObject({
      ok: true,
      conversion: { status: "reversed" },
    });
  });

  it.each([
    [[], /JSON object/],
    [{ click_id: "<x>" }, /click_id/],
    [{ email: "nope" }, /email/],
    [{ event: "purchase" }, /event must be one of sale, lead, signup, custom/],
    [{ value: "49.99" }, /value must be a number/],
    [{ value: -5 }, /value/],
    [{ currency: "dollars" }, /currency/],
    [{ status: "maybe" }, /status/],
    [{ order_id: { id: 1 } }, /order_id/],
    [{ occurred_at: "yesterday" }, /occurred_at must be an ISO 8601 time/],
    [{ occurred_at: "2020-01-01T00:00:00Z" }, /within the past year/],
  ])("explains what's wrong with %j", (body, error) => {
    const result = parseApiConversion(body, NOW);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(error);
  });
});
