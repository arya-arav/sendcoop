import { and, eq, exists, not, or, type SQL, sql } from "drizzle-orm";
import { getDb } from "../client";
import { listMemberships, subscribers, subscriberTags } from "../schema";
import type { SegmentCondition, SegmentRules } from "../segments";
import { escapeLike } from "./like";

/**
 * Turns segment rules into a WHERE condition on the subscribers table. Rules
 * must have passed segmentRulesProblem (known fields, operators and values).
 *
 * Text matching ignores case. Negative text and number operators ("is not",
 * "doesn't contain", "≠") also match subscribers with no value, so "first name
 * is not Priya" includes people without a first name. Custom dates are stored
 * as YYYY-MM-DD text, which sorts like the dates themselves, so they're compared
 * as text and a bad value can never make the query fail.
 */
export function segmentSql(rules: SegmentRules): SQL {
  return combine(
    rules.match,
    rules.conditions.map((c) =>
      c.type === "group" ? combine(c.match, c.conditions.map(conditionSql)) : conditionSql(c),
    ),
  );
}

function combine(match: "all" | "any", parts: SQL[]): SQL {
  if (parts.length === 0) return sql`true`;
  return (match === "all" ? and(...parts) : or(...parts))!;
}

const BUILTIN_COLUMNS = {
  email: subscribers.email,
  first_name: subscribers.firstName,
  last_name: subscribers.lastName,
  status: subscribers.status,
  source: subscribers.source,
  created_at: subscribers.createdAt,
  subscribed_at: subscribers.subscribedAt,
} as const;
const TEXT_BUILTINS = new Set(["email", "first_name", "last_name"]);
const DATE_BUILTINS = new Set(["created_at", "subscribed_at"]);

function conditionSql(c: SegmentCondition): SQL {
  const db = getDb();
  if (c.type === "list") {
    const member = exists(
      db
        .select({ one: sql`1` })
        .from(listMemberships)
        .where(
          and(
            eq(listMemberships.subscriberId, subscribers.id),
            eq(listMemberships.listId, c.listId),
          ),
        ),
    );
    return c.op === "in" ? member : not(member);
  }
  if (c.type === "tag") {
    const tagged = exists(
      db
        .select({ one: sql`1` })
        .from(subscriberTags)
        .where(
          and(eq(subscriberTags.subscriberId, subscribers.id), eq(subscriberTags.tagId, c.tagId)),
        ),
    );
    return c.op === "has" ? tagged : not(tagged);
  }

  if (c.type === "activity") return activitySql(c);

  const value = (c.value ?? "").trim();
  const computed = CONVERSION_FIELDS[c.field as keyof typeof CONVERSION_FIELDS];
  if (computed) {
    return c.field === "last_conversion_at"
      ? timestampSql(computed, c.op, value)
      : numberSql(computed, c.op, value);
  }
  if (c.field.startsWith("custom:"))
    return customFieldSql(c.field.slice("custom:".length), c.op, value);

  const column = BUILTIN_COLUMNS[c.field as keyof typeof BUILTIN_COLUMNS];
  if (TEXT_BUILTINS.has(c.field)) return textSql(sql`${column}`, c.op, value);
  if (DATE_BUILTINS.has(c.field)) return timestampSql(sql`${column}`, c.op, value);
  // status / source
  return c.op === "is" ? sql`${column}::text = ${value}` : sql`${column}::text <> ${value}`;
}

// Per subscriber, from their approved conversions (D53).
const CONVERSION_FIELDS = {
  lifetime_value: sql`(select coalesce(sum(cv.value_base), 0) from conversions cv
    where cv.subscriber_id = ${subscribers.id} and cv.status = 'approved')`,
  conversion_count: sql`(select count(*) from conversions cv
    where cv.subscriber_id = ${subscribers.id} and cv.status = 'approved')`,
  last_conversion_at: sql`(select max(cv.created_at) from conversions cv
    where cv.subscriber_id = ${subscribers.id} and cv.status = 'approved')`,
} as const;

/**
 * Did (or didn't) receive, open, click or convert: in one campaign or any,
 * ever or in the last N days. Machine opens and scanner clicks don't count:
 * messages only record a person's first open and click.
 */
function activitySql(c: Extract<SegmentCondition, { type: "activity" }>): SQL {
  const campaign = c.campaignId ? sql` and campaign_id = ${c.campaignId}` : sql``;
  const since = (column: string) =>
    c.withinDays
      ? sql` and ${sql.raw(column)} >= now() - make_interval(days => ${c.withinDays})`
      : sql``;
  const happened =
    c.event === "converted"
      ? sql`exists (select 1 from conversions where subscriber_id = ${subscribers.id}
          and status = 'approved'${campaign}${since("created_at")})`
      : c.event === "received"
        ? sql`exists (select 1 from messages where subscriber_id = ${subscribers.id}
            and status = 'sent'${campaign}${since("sent_at")})`
        : c.event === "opened"
          ? sql`exists (select 1 from messages where subscriber_id = ${subscribers.id}
              and opened_at is not null${campaign}${since("opened_at")})`
          : sql`exists (select 1 from messages where subscriber_id = ${subscribers.id}
              and clicked_at is not null${campaign}${since("clicked_at")})`;
  return c.op === "did" ? happened : sql`not ${happened}`;
}

function numberSql(column: SQL, op: string, value: string): SQL {
  const n = Number(value);
  switch (op) {
    case "eq":
      return sql`${column} = ${n}`;
    case "neq":
      return sql`${column} <> ${n}`;
    case "gt":
      return sql`${column} > ${n}`;
    case "gte":
      return sql`${column} >= ${n}`;
    case "lt":
      return sql`${column} < ${n}`;
    default: // lte
      return sql`${column} <= ${n}`;
  }
}

/** Case-insensitive text tests; null-safe for the negative ones. */
function textSql(column: SQL, op: string, value: string): SQL {
  const lowered = sql`lower(${column})`;
  const v = value.toLowerCase();
  const like = (pattern: string) => sql`${lowered} like ${pattern}`;
  switch (op) {
    case "equals":
      return sql`${lowered} = ${v}`;
    case "not_equals":
      return sql`coalesce(${lowered}, '') <> ${v}`;
    case "contains":
      return like(`%${escapeLike(v)}%`);
    case "not_contains":
      return sql`coalesce(${lowered}, '') not like ${`%${escapeLike(v)}%`}`;
    case "starts_with":
      return like(`${escapeLike(v)}%`);
    case "ends_with":
      return like(`%${escapeLike(v)}`);
    case "is_set":
      return sql`coalesce(${column}, '') <> ''`;
    default: // is_not_set
      return sql`coalesce(${column}, '') = ''`;
  }
}

/** Dates on timestamp columns, by UTC calendar day. */
function timestampSql(column: SQL, op: string, value: string): SQL {
  switch (op) {
    case "on":
      return sql`(${column} at time zone 'UTC')::date = ${value}::date`;
    case "before":
      return sql`(${column} at time zone 'UTC')::date < ${value}::date`;
    case "after":
      return sql`(${column} at time zone 'UTC')::date > ${value}::date`;
    case "in_last_days":
      return sql`${column} >= now() - make_interval(days => ${Number(value)})`;
    case "more_than_days_ago":
      return sql`${column} < now() - make_interval(days => ${Number(value)})`;
    case "is_set":
      return sql`${column} is not null`;
    default:
      return sql`${column} is null`;
  }
}

/** Custom fields from the JSONB column. Values are only stored when non-empty. */
function customFieldSql(key: string, op: string, value: string): SQL {
  const json = sql`${subscribers.fields}`;
  const text = sql`(${json} ->> ${key})`;
  // Only real JSON numbers are compared numerically, so a stray value can't break the cast.
  const number = sql`(case when jsonb_typeof(${json} -> ${key}) = 'number' then (${json} ->> ${key})::numeric end)`;
  const n = Number(value);
  const daysAgo = sql`to_char(current_date - ${Number(value)}::int, 'YYYY-MM-DD')`;

  switch (op) {
    case "is_set":
      return sql`${json} ? ${key}`;
    case "is_not_set":
      return sql`not (${json} ? ${key})`;
    // number
    case "eq":
      return sql`${number} = ${n}`;
    case "neq":
      return sql`${number} is distinct from ${n}`;
    case "gt":
      return sql`${number} > ${n}`;
    case "gte":
      return sql`${number} >= ${n}`;
    case "lt":
      return sql`${number} < ${n}`;
    case "lte":
      return sql`${number} <= ${n}`;
    // date (YYYY-MM-DD text)
    case "on":
      return sql`${text} = ${value}`;
    case "before":
      return sql`${text} < ${value}`;
    case "after":
      return sql`${text} > ${value}`;
    case "in_last_days":
      return sql`${text} >= ${daysAgo}`;
    case "more_than_days_ago":
      return sql`${text} < ${daysAgo}`;
    // dropdown (exact option, as stored)
    case "is":
      return sql`${text} = ${value}`;
    case "is_not":
      return sql`${text} is distinct from ${value}`;
    // text
    default:
      return textSql(text, op, value);
  }
}
