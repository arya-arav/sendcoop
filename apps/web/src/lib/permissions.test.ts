import { describe, expect, it } from "vitest";
import { canManage } from "./permissions";

describe("canManage", () => {
  it.each([
    ["owner", true],
    ["admin", true],
    ["member", false],
    ["member, admin", true],
    ["", false],
    ["owners", false],
  ])("%j -> %s", (role, expected) => {
    expect(canManage(role)).toBe(expected);
  });
});
