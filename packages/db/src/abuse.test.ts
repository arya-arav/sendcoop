import { describe, expect, it } from "vitest";
import { riskyAddress, warmupLimit } from "./abuse";

describe("warmupLimit", () => {
  const created = new Date("2026-10-01T12:00:00Z");
  const at = (hours: number) => new Date(created.getTime() + hours * 3_600_000);

  it("rises over the first two weeks, then stops applying", () => {
    expect(warmupLimit(created, at(2))).toEqual({
      perDay: 1_000,
      risesAt: new Date("2026-10-02T12:00:00Z"),
    });
    expect(warmupLimit(created, at(30))?.perDay).toBe(5_000);
    expect(warmupLimit(created, at(24 * 5))?.perDay).toBe(20_000);
    expect(warmupLimit(created, at(24 * 10))?.perDay).toBe(50_000);
    expect(warmupLimit(created, at(24 * 14))).toBeNull();
  });
});

describe("riskyAddress", () => {
  it("spots shared mailboxes and throwaway inboxes", () => {
    expect(riskyAddress("Info@Shop.example")).toBe("role");
    expect(riskyAddress("someone@mailinator.com")).toBe("disposable");
    expect(riskyAddress("info@yopmail.com")).toBe("disposable");
    expect(riskyAddress("robin@example.com")).toBeNull();
  });
});
