import { describe, expect, it } from "vitest";
import { extractEmails } from "./suppression-input";

describe("extractEmails", () => {
  it("reads one address per line, lowercased and without duplicates", () => {
    expect(extractEmails("A@example.com\n\n b@example.com \r\na@EXAMPLE.com\n")).toEqual({
      emails: ["a@example.com", "b@example.com"],
      invalid: 0,
    });
  });

  it("finds the address in any column of a CSV, skipping headers and junk", () => {
    const csv = [
      "\uFEFFemail,reason,added",
      '"carl@example.com",bounce,2026-10-08',
      "Dana;dana@example.com;x",
      "not an address",
      "eve@example.com\tmanual",
    ].join("\n");
    expect(extractEmails(csv)).toEqual({
      emails: ["carl@example.com", "dana@example.com", "eve@example.com"],
      invalid: 2,
    });
  });
});
