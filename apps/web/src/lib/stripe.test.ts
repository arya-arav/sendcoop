import { describe, expect, it } from "vitest";
import { subscriptionStatus } from "./stripe";

describe("subscriptionStatus", () => {
  it("keeps paying subscriptions on their plan", () => {
    expect(subscriptionStatus("active")).toBe("active");
    expect(subscriptionStatus("trialing")).toBe("trialing");
    expect(subscriptionStatus("past_due")).toBe("past_due");
    expect(subscriptionStatus("unpaid")).toBe("past_due");
  });

  it("waits for the first payment, and ends the rest", () => {
    expect(subscriptionStatus("incomplete")).toBeNull();
    expect(subscriptionStatus("incomplete_expired")).toBe("canceled");
    expect(subscriptionStatus("canceled")).toBe("canceled");
    expect(subscriptionStatus("paused")).toBe("canceled");
  });
});
