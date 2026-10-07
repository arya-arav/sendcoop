import { describe, expect, it } from "vitest";
import { slugCandidate, slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["Acme Inc.", "acme-inc"],
    ["  Priya's   workspace ", "priya-s-workspace"],
    ["Crème Brûlée Co.", "creme-brulee-co"],
    ["Ünïcödé Straße", "unicode-strasse"],
    ["2026 Q4 Launch!!", "2026-q4-launch"],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("falls back when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("workspace");
    expect(slugify("日本語")).toBe("workspace");
  });

  it("never ends with a hyphen after truncating", () => {
    const slug = slugify("a".repeat(39) + " b", 40);
    expect(slug).toBe("a".repeat(39));
  });
});

describe("slugCandidate", () => {
  it("uses the plain slug first, then adds a 4-character suffix", () => {
    expect(slugCandidate("acme", 0)).toBe("acme");
    expect(slugCandidate("acme", 1)).toMatch(/^acme-[a-z0-9]{1,4}$/);
  });
});
