import { describe, expect, it } from "vitest";
import {
  operatorsFor,
  type SegmentRules,
  segmentFields,
  segmentRulesProblem,
  segmentRulesSchema,
} from "./segments";

const fields = segmentFields([
  { key: "plan", label: "Plan", type: "dropdown", options: ["Starter", "Pro"] },
  { key: "lead_score", label: "Lead score", type: "number", options: [] },
  { key: "birthday", label: "Birthday", type: "date", options: [] },
]);
const context = {
  fields,
  listIds: new Set(["list-1"]),
  tagIds: new Set(["tag-1"]),
  campaignIds: new Set(["campaign-1"]),
};
const problem = (rules: SegmentRules) => segmentRulesProblem(rules, context);

describe("segmentFields", () => {
  it("lists built-ins, then custom fields with matching kinds", () => {
    expect(fields.slice(-3).map((f) => [f.key, f.kind])).toEqual([
      ["custom:plan", "enum"],
      ["custom:lead_score", "number"],
      ["custom:birthday", "date"],
    ]);
  });

  it("doesn't offer 'is filled in' for always-set built-ins", () => {
    const status = fields.find((f) => f.key === "status")!;
    expect(operatorsFor(status).map((o) => o.value)).toEqual(["is", "is_not"]);
  });
});

describe("segmentRulesProblem", () => {
  it("accepts valid rules with a group", () => {
    expect(
      problem({
        match: "all",
        conditions: [
          { type: "list", op: "in", listId: "list-1" },
          {
            type: "group",
            match: "any",
            conditions: [
              { type: "field", field: "custom:lead_score", op: "gt", value: "50" },
              { type: "tag", op: "has", tagId: "tag-1" },
            ],
          },
          { type: "field", field: "created_at", op: "in_last_days", value: "30" },
          { type: "field", field: "first_name", op: "is_set" },
        ],
      }),
    ).toBeNull();
  });

  it.each<[string, SegmentRules, RegExp]>([
    ["no conditions", { match: "all", conditions: [] }, /at least one/],
    [
      "empty group",
      { match: "all", conditions: [{ type: "group", match: "any", conditions: [] }] },
      /group has no conditions/,
    ],
    [
      "unknown field",
      {
        match: "all",
        conditions: [{ type: "field", field: "custom:gone", op: "equals", value: "x" }],
      },
      /no longer exists/,
    ],
    [
      "wrong operator",
      { match: "all", conditions: [{ type: "field", field: "status", op: "is_set" }] },
      /can't be compared/,
    ],
    [
      "missing value",
      { match: "all", conditions: [{ type: "field", field: "email", op: "contains", value: " " }] },
      /Enter a value/,
    ],
    [
      "not a number",
      {
        match: "all",
        conditions: [{ type: "field", field: "custom:lead_score", op: "gt", value: "lots" }],
      },
      /needs a number/,
    ],
    [
      "bad days",
      {
        match: "all",
        conditions: [{ type: "field", field: "created_at", op: "in_last_days", value: "0" }],
      },
      /number of days/,
    ],
    [
      "bad option",
      {
        match: "all",
        conditions: [{ type: "field", field: "custom:plan", op: "is", value: "Gold" }],
      },
      /one of the options/,
    ],
    [
      "foreign list",
      { match: "all", conditions: [{ type: "list", op: "in", listId: "other" }] },
      /Choose a list/,
    ],
  ])("reports %s", (_, rules, message) => {
    expect(problem(rules)).toMatch(message);
  });
});

describe("segmentRulesSchema", () => {
  it("rejects groups inside groups", () => {
    const nested = {
      match: "all",
      conditions: [
        {
          type: "group",
          match: "any",
          conditions: [{ type: "group", match: "all", conditions: [] }],
        },
      ],
    };
    expect(segmentRulesSchema.safeParse(nested).success).toBe(false);
  });
});

describe("activity conditions (D53)", () => {
  const activity = (over: Record<string, unknown>) =>
    segmentRulesSchema.parse({
      match: "all",
      conditions: [
        {
          type: "activity",
          op: "did",
          event: "clicked",
          campaignId: null,
          withinDays: null,
          ...over,
        },
      ],
    });

  it("accepts any campaign or a known one, ever or within days", () => {
    expect(problem(activity({}))).toBeNull();
    expect(problem(activity({ campaignId: "campaign-1", withinDays: 30 }))).toBeNull();
    expect(problem(activity({ campaignId: "gone" }))).toMatch(/campaign that no longer exists/);
  });

  it("checks the event, operator and days", () => {
    expect(() => activity({ event: "forwarded" })).toThrow();
    expect(() => activity({ op: "maybe" })).toThrow();
    expect(() => activity({ withinDays: 0 })).toThrow();
  });

  it("offers conversion fields with number and date operators", () => {
    const ltv = fields.find((f) => f.key === "lifetime_value")!;
    expect(ltv.kind).toBe("number");
    expect(operatorsFor(ltv).map((o) => o.value)).not.toContain("is_set");
    expect(fields.find((f) => f.key === "last_conversion_at")?.kind).toBe("date");
  });
});
