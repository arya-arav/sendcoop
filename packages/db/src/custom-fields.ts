// Browser-safe: no runtime imports, so client components can use it via
// "@sendcoop/db/custom-fields" without bundling the database driver.
import type { CustomFieldType, SubscriberStatus } from "./schema";

export type { CustomFieldType, SubscriberStatus };

// Rules for custom field keys and values, shared by the subscriber form,
// CSV import (worker) and the API, so a value means the same thing everywhere.

export const MAX_CUSTOM_FIELDS = 50;
export const MAX_DROPDOWN_OPTIONS = 50;
const MAX_TEXT_LENGTH = 500;
const MAX_OPTION_LENGTH = 100;

/** Keys that would clash with built-in subscriber properties or merge tags. */
export const RESERVED_FIELD_KEYS = new Set([
  "id",
  "email",
  "first_name",
  "last_name",
  "name",
  "full_name",
  "status",
  "source",
  "list",
  "lists",
  "created_at",
  "updated_at",
  "subscribed_at",
  "unsubscribed_at",
  "unsubscribe_url",
  "workspace",
]);

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** "Favourite offer (2026)" -> "favourite_offer_2026". */
export function fieldKeyFromLabel(label: string): string {
  const key = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // drop accents split off by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "") // must start with a letter
    .slice(0, 40)
    .replace(/_+$/, "");
  return key || "field";
}

export function fieldKeyProblem(key: string): string | null {
  if (!KEY_PATTERN.test(key)) {
    return "Use lowercase letters, numbers and underscores, starting with a letter (max 40).";
  }
  if (RESERVED_FIELD_KEYS.has(key)) return `“${key}” is reserved. Choose another key.`;
  return null;
}

/** Trims, drops blanks and duplicates (ignoring case), keeps the first spelling. */
export function normalizeOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of options) {
    const option = raw.trim().slice(0, MAX_OPTION_LENGTH);
    if (!option || seen.has(option.toLowerCase())) continue;
    seen.add(option.toLowerCase());
    result.push(option);
  }
  return result;
}

export type FieldDefinition = {
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
};
export type FieldValue = string | number;
export type ParsedFieldValues =
  { ok: true; values: Record<string, FieldValue> } | { ok: false; errors: Record<string, string> };

/**
 * Validates raw values (form strings, CSV cells or JSON) against the
 * workspace's field definitions. Blank values are left out; keys without a
 * definition are ignored.
 */
export function parseFieldValues(
  definitions: FieldDefinition[],
  raw: Record<string, unknown>,
): ParsedFieldValues {
  const values: Record<string, FieldValue> = {};
  const errors: Record<string, string> = {};

  for (const field of definitions) {
    const input = raw[field.key];
    if (input === undefined || input === null) continue;
    if (typeof input !== "string" && typeof input !== "number") {
      errors[field.key] = `${field.label} has an unsupported value.`;
      continue;
    }
    const text = String(input).trim();
    if (text === "") continue;

    const parsed = parseValue(field, text);
    if (parsed.ok) values[field.key] = parsed.value;
    else errors[field.key] = parsed.error;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
}

function parseValue(
  field: FieldDefinition,
  text: string,
): { ok: true; value: FieldValue } | { ok: false; error: string } {
  switch (field.type) {
    case "text":
      return text.length <= MAX_TEXT_LENGTH
        ? { ok: true, value: text }
        : { ok: false, error: `${field.label} must be ${MAX_TEXT_LENGTH} characters or fewer.` };

    case "number": {
      const value = Number(text);
      return Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} must be a number.` };
    }

    case "date":
      return isCalendarDate(text)
        ? { ok: true, value: text }
        : { ok: false, error: `${field.label} must be a date like 2026-10-31.` };

    case "dropdown": {
      // Case-insensitive match, stored with the option's own spelling.
      const match = field.options.find((o) => o.toLowerCase() === text.toLowerCase());
      return match
        ? { ok: true, value: match }
        : { ok: false, error: `${field.label} must be one of: ${field.options.join(", ")}.` };
    }
  }
}

/** YYYY-MM-DD that exists on the calendar (rejects 2026-02-30). */
function isCalendarDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
