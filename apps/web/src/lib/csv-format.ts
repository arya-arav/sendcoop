import { MAX_IMPORT_COLUMNS } from "@sendcoop/db/imports";
import Papa from "papaparse";
import { z } from "zod";

// Works out how to read an uploaded CSV from its first bytes. The result is
// stored on the import, and the worker reads the whole file the same way.

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024; // roughly 500k rows of a typical export
export const SAMPLE_ROWS = 10;
const MAX_CELL_PREVIEW = 200;

export type CsvFormat = {
  encoding: "utf-8" | "windows-1252";
  delimiter: string;
  hasHeader: boolean;
  columns: string[];
  sampleRows: string[][];
};

export class CsvFormatError extends Error {}

const email = z.email();

/**
 * @param head the first bytes of the file
 * @param complete true if `head` is the whole file
 */
export function detectCsvFormat(head: Uint8Array, complete: boolean): CsvFormat {
  // Cut at the last line break so no row or multi-byte character is split.
  let bytes = head;
  if (!complete) {
    const lastNewline = head.lastIndexOf(0x0a);
    if (lastNewline < 0) throw new CsvFormatError("The first line is too long to be a CSV header.");
    bytes = head.subarray(0, lastNewline + 1);
  }

  let encoding: CsvFormat["encoding"] = "utf-8";
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Not UTF-8: most likely an Excel export in the Windows Western encoding.
    encoding = "windows-1252";
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  text = text.replace(/^\uFEFF/, ""); // byte order mark

  const parsed = Papa.parse<string[]>(text, {
    preview: SAMPLE_ROWS + 1,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
  });
  const rows = parsed.data.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) throw new CsvFormatError("The file is empty.");

  const width = Math.max(...rows.map((r) => r.length));
  if (width > MAX_IMPORT_COLUMNS) {
    throw new CsvFormatError(`The file has ${width} columns; the limit is ${MAX_IMPORT_COLUMNS}.`);
  }

  // A first row containing an email address is data, not a header.
  const first = rows[0]!;
  const hasHeader = !first.some((cell) => email.safeParse(cell.trim()).success);
  const columns = Array.from({ length: width }, (_, i) =>
    hasHeader && first[i]?.trim() ? first[i]!.trim() : `Column ${i + 1}`,
  );
  const sampleRows = (hasHeader ? rows.slice(1) : rows)
    .slice(0, SAMPLE_ROWS)
    .map((row) =>
      Array.from({ length: width }, (_, i) => (row[i] ?? "").slice(0, MAX_CELL_PREVIEW)),
    );

  return { encoding, delimiter: parsed.meta.delimiter, hasHeader, columns, sampleRows };
}
