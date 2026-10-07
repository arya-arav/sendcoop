import { describe, expect, it } from "vitest";
import type { FieldDefinition } from "./custom-fields";
import { importTargets, mappingProblem, mapRow, suggestMapping } from "./imports";

const fields: FieldDefinition[] = [
  { key: "company", label: "Company", type: "text", options: [] },
  { key: "lead_score", label: "Lead score", type: "number", options: [] },
  { key: "plan", label: "Plan", type: "dropdown", options: ["Starter", "Pro"] },
];

describe("suggestMapping", () => {
  it("recognises common header spellings and custom fields", () => {
    const headers = ["E-mail Address", "First Name", "Surname", "Lead Score", "company", "Notes"];
    expect(suggestMapping(6, { headers, fields })).toEqual({
      columns: ["email", "first_name", "last_name", "field:lead_score", "field:company", null],
    });
  });

  it("uses each target once", () => {
    expect(suggestMapping(3, { headers: ["Email", "email", "Mail"], fields })).toEqual({
      columns: ["email", null, null],
    });
  });

  it("finds the email column from sample values when headers don't name it", () => {
    const sampleRows = [
      ["Ana", "ana@x.com", "x"],
      ["Bo", "bo@x.com", ""],
      ["Cy", "", "y"],
    ];
    expect(suggestMapping(3, { sampleRows, fields })).toEqual({ columns: [null, "email", null] });
    expect(suggestMapping(3, { headers: ["Name", "Contact", "Note"], sampleRows, fields })).toEqual(
      { columns: [null, "email", null] },
    );
  });
});

describe("mappingProblem", () => {
  it("requires exactly one email column", () => {
    expect(mappingProblem({ columns: ["first_name", null] }, 2, fields)).toMatch(/email/);
    expect(mappingProblem({ columns: ["email", null] }, 2, fields)).toBeNull();
  });

  it("rejects duplicates, unknown fields and a wrong column count", () => {
    expect(mappingProblem({ columns: ["email", "email"] }, 2, fields)).toMatch(/same field/);
    expect(mappingProblem({ columns: ["email", "field:gone"] }, 2, fields)).toMatch(/no longer/);
    expect(mappingProblem({ columns: ["email"] }, 2, fields)).toMatch(/columns/);
  });
});

describe("mapRow", () => {
  const mapping = {
    columns: ["email", "first_name", null, "field:lead_score", "field:plan"] as const,
  };

  it("builds a subscriber from the mapped columns", () => {
    expect(
      mapRow(
        [" Priya@Example.com ", "Priya", "ignored", "42", "pro"],
        { columns: [...mapping.columns] },
        fields,
      ),
    ).toEqual({
      ok: true,
      subscriber: {
        email: "priya@example.com",
        firstName: "Priya",
        lastName: null,
        fields: { lead_score: 42, plan: "Pro" },
      },
    });
  });

  it("collects every problem in a row", () => {
    expect(
      mapRow(["not-an-email", "", "", "lots", "Gold"], { columns: [...mapping.columns] }, fields),
    ).toEqual({
      ok: false,
      errors: [
        "“not-an-email” isn't a valid email.",
        "Lead score must be a number.",
        "Plan must be one of: Starter, Pro.",
      ],
    });
    expect(mapRow([], { columns: [...mapping.columns] }, fields)).toEqual({
      ok: false,
      errors: ["Email is missing."],
    });
  });
});

describe("importTargets", () => {
  it("lists built-ins first, then custom fields", () => {
    expect(importTargets(fields).map((t) => t.value)).toEqual([
      "email",
      "first_name",
      "last_name",
      "field:company",
      "field:lead_score",
      "field:plan",
    ]);
  });
});
