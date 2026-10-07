// Browser-safe: used by the mapping preview in the browser and by the import
// worker, so a row is judged the same way in both places.
import { z } from "zod";
import { type FieldDefinition, type FieldValue, parseFieldValues } from "./custom-fields";

export const MAX_IMPORT_COLUMNS = 100;

/** Where a CSV column goes: a built-in property or a custom field ("field:<key>"). */
export type ImportTarget = "email" | "first_name" | "last_name" | `field:${string}`;

/** One entry per CSV column, in order; null means "don't import". */
export type ImportMapping = { columns: (ImportTarget | null)[] };

export type ImportTargetOption = { value: ImportTarget; label: string };

export function importTargets(fields: FieldDefinition[]): ImportTargetOption[] {
  return [
    { value: "email", label: "Email" },
    { value: "first_name", label: "First name" },
    { value: "last_name", label: "Last name" },
    ...fields.map((f) => ({ value: `field:${f.key}` as const, label: f.label })),
  ];
}

const normalize = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

// Common spellings of the built-in columns in exports from other tools.
const SYNONYMS: Record<"email" | "first_name" | "last_name", string[]> = {
  email: ["email", "emailaddress", "mail", "emailid", "subscriberemail", "contactemail"],
  first_name: ["firstname", "first", "fname", "givenname", "forename"],
  last_name: ["lastname", "last", "lname", "surname", "familyname"],
};

/**
 * Guesses a mapping from header names (if the file has them) and sample rows.
 * Each target is used at most once. If no header names the email column, the
 * first column whose sample values are mostly email addresses is used.
 */
export function suggestMapping(
  columnCount: number,
  {
    headers = null,
    sampleRows = [],
    fields,
  }: {
    headers?: string[] | null;
    sampleRows?: string[][];
    fields: FieldDefinition[];
  },
): ImportMapping {
  const used = new Set<ImportTarget>();
  const columns = Array.from({ length: columnCount }, (_, i): ImportTarget | null => {
    const name = normalize(headers?.[i] ?? "");
    if (!name) return null;
    for (const [target, names] of Object.entries(SYNONYMS) as [ImportTarget, string[]][]) {
      if (names.includes(name) && !used.has(target)) {
        used.add(target);
        return target;
      }
    }
    const field = fields.find((f) => normalize(f.key) === name || normalize(f.label) === name);
    const fieldTarget = field ? (`field:${field.key}` as const) : null;
    if (fieldTarget && !used.has(fieldTarget)) {
      used.add(fieldTarget);
      return fieldTarget;
    }
    return null;
  });

  if (!used.has("email") && sampleRows.length > 0) {
    const emailColumn = columns.findIndex((target, i) => {
      if (target !== null) return false;
      const filled = sampleRows.map((row) => (row[i] ?? "").trim()).filter(Boolean);
      const emails = filled.filter((value) => emailSchema.safeParse(value).success);
      return filled.length > 0 && emails.length / filled.length >= 0.8;
    });
    if (emailColumn >= 0) columns[emailColumn] = "email";
  }
  return { columns };
}

/** Why a mapping can't be used, or null if it's fine. */
export function mappingProblem(
  mapping: ImportMapping,
  columnCount: number,
  fields: FieldDefinition[],
): string | null {
  if (mapping.columns.length !== columnCount)
    return "The mapping doesn't match the file's columns.";
  const valid = new Set(importTargets(fields).map((t) => t.value));
  const seen = new Set<ImportTarget>();
  for (const target of mapping.columns) {
    if (target === null) continue;
    if (!valid.has(target)) return "A column is mapped to a field that no longer exists.";
    if (seen.has(target)) return "Two columns are mapped to the same field.";
    seen.add(target);
  }
  if (!seen.has("email")) return "Choose which column holds the email address.";
  return null;
}

const emailSchema = z.email();

export type MappedRow =
  | {
      ok: true;
      subscriber: {
        email: string;
        firstName: string | null;
        lastName: string | null;
        fields: Record<string, FieldValue>;
      };
    }
  | { ok: false; errors: string[] };

/** Applies a mapping to one CSV row and validates the result. */
export function mapRow(
  row: string[],
  mapping: ImportMapping,
  fields: FieldDefinition[],
): MappedRow {
  let email = "";
  let firstName: string | null = null;
  let lastName: string | null = null;
  const rawFields: Record<string, string> = {};

  mapping.columns.forEach((target, index) => {
    const value = (row[index] ?? "").trim();
    if (!target) return;
    if (target === "email") email = value.toLowerCase();
    else if (target === "first_name") firstName = value.slice(0, 100) || null;
    else if (target === "last_name") lastName = value.slice(0, 100) || null;
    else rawFields[target.slice("field:".length)] = value;
  });

  const errors: string[] = [];
  if (!email) errors.push("Email is missing.");
  else if (!emailSchema.safeParse(email).success) errors.push(`“${email}” isn't a valid email.`);

  const parsed = parseFieldValues(fields, rawFields);
  if (!parsed.ok) errors.push(...Object.values(parsed.errors));

  return errors.length > 0 || !parsed.ok
    ? { ok: false, errors }
    : { ok: true, subscriber: { email, firstName, lastName, fields: parsed.values } };
}
