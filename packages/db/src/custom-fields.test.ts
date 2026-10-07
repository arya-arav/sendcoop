import { describe, expect, it } from "vitest";
import {
  type FieldDefinition,
  fieldKeyFromLabel,
  fieldKeyProblem,
  normalizeOptions,
  parseFieldValues,
} from "./custom-fields";

describe("fieldKeyFromLabel", () => {
  it.each([
    ["Favourite offer", "favourite_offer"],
    ["Order total ($)", "order_total"],
    ["Café visits", "cafe_visits"],
    ["2026 budget", "budget"],
    ["!!!", "field"],
    ["a".repeat(60), "a".repeat(40)],
  ])("%s -> %s", (label, key) => {
    expect(fieldKeyFromLabel(label)).toBe(key);
  });
});

describe("fieldKeyProblem", () => {
  it("accepts snake_case keys starting with a letter", () => {
    expect(fieldKeyProblem("lead_score")).toBeNull();
    expect(fieldKeyProblem("utm_source2")).toBeNull();
  });

  it.each(["Lead", "2fast", "lead-score", "", "a".repeat(41)])("rejects %j", (key) => {
    expect(fieldKeyProblem(key)).toMatch(/lowercase/);
  });

  it("rejects reserved keys", () => {
    expect(fieldKeyProblem("email")).toMatch(/reserved/);
    expect(fieldKeyProblem("first_name")).toMatch(/reserved/);
  });
});

describe("normalizeOptions", () => {
  it("trims, drops blanks and case-insensitive duplicates", () => {
    expect(normalizeOptions([" Keto ", "", "keto", "Paleo", "  "])).toEqual(["Keto", "Paleo"]);
  });
});

describe("parseFieldValues", () => {
  const fields: FieldDefinition[] = [
    { key: "company", label: "Company", type: "text", options: [] },
    { key: "lead_score", label: "Lead score", type: "number", options: [] },
    { key: "birthday", label: "Birthday", type: "date", options: [] },
    { key: "plan", label: "Plan", type: "dropdown", options: ["Starter", "Pro"] },
  ];

  it("parses each type and leaves blanks out", () => {
    expect(
      parseFieldValues(fields, {
        company: "  Acme ",
        lead_score: "42.5",
        birthday: "1990-02-28",
        plan: "pro",
        unknown_key: "ignored",
      }),
    ).toEqual({
      ok: true,
      values: { company: "Acme", lead_score: 42.5, birthday: "1990-02-28", plan: "Pro" },
    });
    expect(parseFieldValues(fields, { company: "", lead_score: "   " })).toEqual({
      ok: true,
      values: {},
    });
  });

  it("accepts JSON numbers for number fields", () => {
    expect(parseFieldValues(fields, { lead_score: 7 })).toEqual({
      ok: true,
      values: { lead_score: 7 },
    });
  });

  it("reports every invalid field", () => {
    const result = parseFieldValues(fields, {
      lead_score: "lots",
      birthday: "2026-02-30",
      plan: "Enterprise",
      company: "x".repeat(501),
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        company: "Company must be 500 characters or fewer.",
        lead_score: "Lead score must be a number.",
        birthday: "Birthday must be a date like 2026-10-31.",
        plan: "Plan must be one of: Starter, Pro.",
      },
    });
  });

  it.each(["31/12/2026", "2026-13-01", "2026-1-5", "Infinity"])("rejects %j as a date", (value) => {
    expect(parseFieldValues(fields, { birthday: value }).ok).toBe(false);
  });

  it("rejects non-scalar input", () => {
    expect(parseFieldValues(fields, { company: ["a"] }).ok).toBe(false);
  });
});
