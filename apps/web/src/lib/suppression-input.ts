import { z } from "zod";

// Reads addresses for the suppression list from pasted text or an uploaded
// CSV/TXT file, including our own export. Lenient on purpose: each line's
// first valid address counts, and header rows or other columns are ignored.

export const MAX_SUPPRESSION_FILE_BYTES = 20 * 1024 * 1024; // roughly 500k addresses

const email = z.email();

export function extractEmails(text: string): { emails: string[]; invalid: number } {
  const emails = new Set<string>();
  let invalid = 0;
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const found = line
      .split(/[,;\t]/)
      .map((cell) =>
        cell
          .trim()
          .replace(/^["']+|["']+$/g, "")
          .trim(),
      )
      .find((cell) => email.safeParse(cell).success);
    if (found) emails.add(found.toLowerCase());
    else invalid++;
  }
  return { emails: [...emails], invalid };
}
