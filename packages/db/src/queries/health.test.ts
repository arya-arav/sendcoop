import { describe, expect, it } from "vitest";
import { HEALTH_LIMITS, healthLevel, healthRates } from "./health";

describe("health rates", () => {
  it("are shares of the emails sent, and zero before any", () => {
    expect(healthRates({ sent: 200, bounced: 4, complained: 1, unsubscribed: 10 })).toEqual({
      bounceRate: 0.02,
      complaintRate: 0.005,
      unsubscribeRate: 0.05,
    });
    expect(healthRates({ sent: 0, bounced: 0, complained: 0, unsubscribed: 0 }).bounceRate).toBe(0);
  });

  it("are rated against the warning and pause limits", () => {
    expect(healthLevel(0.0005, HEALTH_LIMITS.complaint)).toBe("good");
    expect(healthLevel(0.001, HEALTH_LIMITS.complaint)).toBe("warning");
    expect(healthLevel(0.003, HEALTH_LIMITS.complaint)).toBe("danger");
    expect(healthLevel(0.049, HEALTH_LIMITS.bounce)).toBe("warning");
  });
});
