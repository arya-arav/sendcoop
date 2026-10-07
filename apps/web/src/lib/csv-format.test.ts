import { describe, expect, it } from "vitest";
import { CsvFormatError, detectCsvFormat } from "./csv-format";

const utf8 = (text: string) => new TextEncoder().encode(text);

describe("detectCsvFormat", () => {
  it("reads a comma-separated file with a header", () => {
    const format = detectCsvFormat(utf8("Email,First Name\na@x.com,Ana\nb@x.com,Bo\n"), true);
    expect(format).toEqual({
      encoding: "utf-8",
      delimiter: ",",
      hasHeader: true,
      columns: ["Email", "First Name"],
      sampleRows: [
        ["a@x.com", "Ana"],
        ["b@x.com", "Bo"],
      ],
    });
  });

  it("detects semicolons, tabs and quoted fields", () => {
    expect(detectCsvFormat(utf8('email;name\na@x.com;"Lee; Sam"\n'), true)).toMatchObject({
      delimiter: ";",
      sampleRows: [["a@x.com", "Lee; Sam"]],
    });
    expect(detectCsvFormat(utf8("email\tname\na@x.com\tAna\n"), true).delimiter).toBe("\t");
  });

  it("treats a first row with an email address as data", () => {
    const format = detectCsvFormat(utf8("a@x.com,Ana\nb@x.com,Bo\n"), true);
    expect(format.hasHeader).toBe(false);
    expect(format.columns).toEqual(["Column 1", "Column 2"]);
    expect(format.sampleRows).toHaveLength(2);
  });

  it("strips a byte order mark and names blank header cells", () => {
    const format = detectCsvFormat(utf8("\uFEFFEmail,,Plan\na@x.com,x,Pro\n"), true);
    expect(format.columns).toEqual(["Email", "Column 2", "Plan"]);
  });

  it("falls back to Windows-1252 for Excel exports", () => {
    // "Müller" encoded in Windows-1252 (ü = 0xFC), invalid as UTF-8.
    const bytes = new Uint8Array([...utf8("email,last\na@x.com,M"), 0xfc, ...utf8("ller\n")]);
    const format = detectCsvFormat(bytes, true);
    expect(format.encoding).toBe("windows-1252");
    expect(format.sampleRows[0]).toEqual(["a@x.com", "Müller"]);
  });

  it("only looks at complete lines when given part of a file", () => {
    // The head ends mid-way through "é" (2 bytes in UTF-8) on an unfinished line.
    const full = utf8("email,name\na@x.com,Zoé\nb@x.com,Zoé");
    const head = full.subarray(0, full.length - 1);
    const format = detectCsvFormat(head, false);
    expect(format.encoding).toBe("utf-8");
    expect(format.sampleRows).toEqual([["a@x.com", "Zoé"]]);
  });

  it("keeps ten sample rows and pads short rows", () => {
    const rows = Array.from({ length: 15 }, (_, i) => `p${i}@x.com`).join("\n");
    const format = detectCsvFormat(utf8(`email,name\n${rows}\n`), true);
    expect(format.sampleRows).toHaveLength(10);
    expect(format.sampleRows[0]).toEqual(["p0@x.com", ""]);
  });

  it("rejects empty files and too many columns", () => {
    expect(() => detectCsvFormat(utf8("\n\n"), true)).toThrow(CsvFormatError);
    const wide = Array.from({ length: 101 }, (_, i) => `c${i}`).join(",");
    expect(() => detectCsvFormat(utf8(`${wide}\n`), true)).toThrow(/limit is 100/);
  });
});
