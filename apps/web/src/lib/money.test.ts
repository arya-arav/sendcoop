import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("formats in the currency, with a fallback for unknown codes", () => {
    expect(formatMoney(1250)).toBe("$1,250.00");
    expect(formatMoney(80, "EUR")).toBe("€80.00");
    expect(formatMoney(5, "GBP")).toBe("£5.00");
    expect(formatMoney(3.5, "nope")).toBe("3.50 nope");
  });
});
