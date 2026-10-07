// Browser-safe: segment rules are edited in the browser and turned into SQL on
// the server (queries/segments.ts); both use the definitions here.
import { z } from "zod";
import type { FieldDefinition } from "./custom-fields";

export const MAX_SEGMENT_CONDITIONS = 50;

export type FieldKind = "text" | "number" | "date" | "enum";

/** Something a condition can test: a built-in property or a custom field ("custom:<key>"). */
export type SegmentFieldInfo = {
  key: string;
  label: string;
  kind: FieldKind;
  /** Allowed values for enum fields. */
  options?: { value: string; label: string }[];
  /** Built-ins like status always have a value, so is_set makes no sense. */
  alwaysSet?: boolean;
};

const STATUS_OPTIONS = [
  { value: "subscribed", label: "Subscribed" },
  { value: "pending", label: "Pending" },
  { value: "unsubscribed", label: "Unsubscribed" },
  { value: "bounced", label: "Bounced" },
  { value: "complained", label: "Complained" },
];
const SOURCE_OPTIONS = [
  { value: "manual", label: "Added by hand" },
  { value: "import", label: "Import" },
  { value: "form", label: "Signup form" },
  { value: "api", label: "API" },
  { value: "integration", label: "Integration" },
];

export const BUILTIN_FIELDS: SegmentFieldInfo[] = [
  { key: "email", label: "Email", kind: "text", alwaysSet: true },
  { key: "first_name", label: "First name", kind: "text" },
  { key: "last_name", label: "Last name", kind: "text" },
  { key: "status", label: "Status", kind: "enum", options: STATUS_OPTIONS, alwaysSet: true },
  { key: "source", label: "Source", kind: "enum", options: SOURCE_OPTIONS, alwaysSet: true },
  { key: "created_at", label: "Date added", kind: "date", alwaysSet: true },
  { key: "subscribed_at", label: "Date subscribed", kind: "date" },
];

/** Every field a segment can test, for this workspace's custom fields. */
export function segmentFields(customFields: FieldDefinition[]): SegmentFieldInfo[] {
  return [
    ...BUILTIN_FIELDS,
    ...customFields.map((f): SegmentFieldInfo => ({
      key: `custom:${f.key}`,
      label: f.label,
      kind: f.type === "dropdown" ? "enum" : f.type,
      options: f.type === "dropdown" ? f.options.map((o) => ({ value: o, label: o })) : undefined,
    })),
  ];
}

export const OPERATORS: Record<FieldKind, { value: string; label: string; needsValue: boolean }[]> =
  {
    text: [
      { value: "equals", label: "is", needsValue: true },
      { value: "not_equals", label: "is not", needsValue: true },
      { value: "contains", label: "contains", needsValue: true },
      { value: "not_contains", label: "doesn't contain", needsValue: true },
      { value: "starts_with", label: "starts with", needsValue: true },
      { value: "ends_with", label: "ends with", needsValue: true },
      { value: "is_set", label: "is filled in", needsValue: false },
      { value: "is_not_set", label: "is empty", needsValue: false },
    ],
    number: [
      { value: "eq", label: "=", needsValue: true },
      { value: "neq", label: "≠", needsValue: true },
      { value: "gt", label: ">", needsValue: true },
      { value: "gte", label: "≥", needsValue: true },
      { value: "lt", label: "<", needsValue: true },
      { value: "lte", label: "≤", needsValue: true },
      { value: "is_set", label: "is filled in", needsValue: false },
      { value: "is_not_set", label: "is empty", needsValue: false },
    ],
    date: [
      { value: "on", label: "is on", needsValue: true },
      { value: "before", label: "is before", needsValue: true },
      { value: "after", label: "is after", needsValue: true },
      { value: "in_last_days", label: "is in the last … days", needsValue: true },
      { value: "more_than_days_ago", label: "is more than … days ago", needsValue: true },
      { value: "is_set", label: "is filled in", needsValue: false },
      { value: "is_not_set", label: "is empty", needsValue: false },
    ],
    enum: [
      { value: "is", label: "is", needsValue: true },
      { value: "is_not", label: "is not", needsValue: true },
      { value: "is_set", label: "is filled in", needsValue: false },
      { value: "is_not_set", label: "is empty", needsValue: false },
    ],
  };

/** Operators offered for a field (no "is filled in/empty" on always-set built-ins). */
export function operatorsFor(field: SegmentFieldInfo) {
  return OPERATORS[field.kind].filter(
    (op) => !field.alwaysSet || (op.value !== "is_set" && op.value !== "is_not_set"),
  );
}

export const LIST_OPERATORS = [
  { value: "in", label: "is on" },
  { value: "not_in", label: "is not on" },
] as const;
export const TAG_OPERATORS = [
  { value: "has", label: "has" },
  { value: "not_has", label: "doesn't have" },
] as const;

const fieldCondition = z.object({
  type: z.literal("field"),
  field: z.string().min(1).max(60),
  op: z.string().min(1).max(30),
  value: z.string().max(500).optional(),
});
const listCondition = z.object({
  type: z.literal("list"),
  op: z.enum(["in", "not_in"]),
  listId: z.string().max(64),
});
const tagCondition = z.object({
  type: z.literal("tag"),
  op: z.enum(["has", "not_has"]),
  tagId: z.string().max(64),
});
const condition = z.discriminatedUnion("type", [fieldCondition, listCondition, tagCondition]);
const match = z.enum(["all", "any"]);
const group = z.object({
  type: z.literal("group"),
  match,
  conditions: z.array(condition).max(MAX_SEGMENT_CONDITIONS),
});

/** A segment: conditions (and one level of groups) that all or any must match. */
export const segmentRulesSchema = z.object({
  match,
  conditions: z.array(z.union([condition, group])).max(MAX_SEGMENT_CONDITIONS),
});

export type SegmentRules = z.infer<typeof segmentRulesSchema>;
export type SegmentCondition = z.infer<typeof condition>;
export type SegmentGroup = z.infer<typeof group>;

export const EMPTY_RULES: SegmentRules = { match: "all", conditions: [] };

/**
 * What's wrong with a set of rules for this workspace, or null if they can be
 * saved and run. Checks fields, operators, values, lists and tags exist.
 */
export function segmentRulesProblem(
  rules: SegmentRules,
  context: { fields: SegmentFieldInfo[]; listIds: Set<string>; tagIds: Set<string> },
): string | null {
  const all = rules.conditions.flatMap((c) => (c.type === "group" ? c.conditions : [c]));
  if (rules.conditions.some((c) => c.type === "group" && c.conditions.length === 0)) {
    return "A group has no conditions. Add one or remove the group.";
  }
  if (all.length === 0) return "Add at least one condition.";
  if (all.length > MAX_SEGMENT_CONDITIONS) {
    return `Use at most ${MAX_SEGMENT_CONDITIONS} conditions.`;
  }
  const fields = new Map(context.fields.map((f) => [f.key, f]));

  for (const c of all) {
    if (c.type === "list") {
      if (!context.listIds.has(c.listId)) return "Choose a list for every list condition.";
      continue;
    }
    if (c.type === "tag") {
      if (!context.tagIds.has(c.tagId)) return "Choose a tag for every tag condition.";
      continue;
    }
    const field = fields.get(c.field);
    if (!field) return "A condition uses a field that no longer exists.";
    const op = operatorsFor(field).find((o) => o.value === c.op);
    if (!op) return `“${field.label}” can't be compared that way.`;
    if (!op.needsValue) continue;

    const value = (c.value ?? "").trim();
    if (!value) return `Enter a value for “${field.label} ${op.label}”.`;
    if (field.kind === "number" && !Number.isFinite(Number(value))) {
      return `“${field.label}” needs a number.`;
    }
    if (field.kind === "date") {
      if (c.op === "in_last_days" || c.op === "more_than_days_ago") {
        if (!/^\d{1,5}$/.test(value) || Number(value) < 1) {
          return `Enter a number of days for “${field.label}”.`;
        }
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `Enter a date for “${field.label}”.`;
      }
    }
    if (field.kind === "enum" && !field.options?.some((o) => o.value === value)) {
      return `Choose one of the options for “${field.label}”.`;
    }
  }
  return null;
}
