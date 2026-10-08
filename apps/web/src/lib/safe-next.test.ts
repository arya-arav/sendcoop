import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
  });

  it("refuses anything that could leave it", () => {
    for (const next of [
      undefined,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "invite",
    ]) {
      expect(safeNext(next)).toBeUndefined();
    }
  });
});
