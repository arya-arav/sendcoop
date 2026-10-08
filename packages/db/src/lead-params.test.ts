import { describe, expect, it } from "vitest";
import { parseLead, parseLeadStage } from "./lead-params";

describe("parseLead", () => {
  it("reads a new lead from a form tool", () => {
    expect(
      parseLead({
        "Email Address": "Ada@Example.com",
        "Full Name": "Ada King Lovelace",
        submission_id: "sub_123",
        sc_cid: "sc4Fh9KqZ2LmPx7Ty1",
        message: "Call me",
      }),
    ).toEqual({
      ok: true,
      lead: {
        leadId: "sub_123",
        email: "ada@example.com",
        clickId: "sc4Fh9KqZ2LmPx7Ty1",
        stage: "new",
        value: null,
        currency: "USD",
        firstName: "Ada",
        lastName: "King Lovelace",
      },
    });
  });

  it("reads a status update from a CRM", () => {
    expect(
      parseLead({ lead_id: "sub_123", status: "Closed Won", amount: "$1,500", currency: "eur" }),
    ).toMatchObject({
      ok: true,
      lead: { leadId: "sub_123", email: null, stage: "sold", value: 1500, currency: "EUR" },
    });
  });

  it("prefers separate name fields", () => {
    expect(
      parseLead({ email: "a@b.co", firstName: "Grace", last_name: "Hopper", name: "x y" }),
    ).toMatchObject({ ok: true, lead: { firstName: "Grace", lastName: "Hopper" } });
  });

  it("explains what's missing or wrong", () => {
    expect(parseLead({ name: "Nobody" })).toEqual({
      ok: false,
      error: "Send the lead's email or lead_id.",
    });
    expect(parseLead({ email: "nope" })).toMatchObject({ ok: false, error: /email/ });
    expect(parseLead({ lead_id: "1", status: "maybe" })).toMatchObject({
      ok: false,
      error: /Unknown status "maybe"/,
    });
    expect(parseLead({ lead_id: "1", value: "lots" })).toMatchObject({ ok: false, error: /value/ });
  });
});

describe("parseLeadStage", () => {
  it.each([
    ["new", "new"],
    ["Contacted", "qualified"],
    ["SQL", "qualified"],
    ["won", "sold"],
    ["closed_won", "sold"],
    ["Disqualified", "lost"],
    ["closed-lost", "lost"],
    ["whatever", null],
  ])("%s -> %s", (raw, stage) => {
    expect(parseLeadStage(raw)).toBe(stage);
  });
});
