import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "../client";
import { workspaces } from "../schema";
import type { SegmentRules } from "../segments";
import { bulkAddTag } from "./bulk";
import { createCustomField } from "./custom-fields";
import { createList } from "./lists";
import { previewSegment } from "./segments";
import { createSubscriber } from "./subscribers";
import { findOrCreateTag } from "./tags";

// The engine's counts must match hand-written SQL over the same data.

const db = getDb();
const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let other: string;
let keto: string;
let vip: string;

beforeAll(async () => {
  const rows = await db
    .insert(workspaces)
    .values([
      { name: "Engine", slug: `int-engine-${run}` },
      { name: "Engine other", slug: `int-engine-other-${run}` },
    ])
    .returning({ id: workspaces.id });
  [ws, other] = rows.map((r) => r.id) as [string, string];

  for (const [key, type, options] of [
    ["plan", "dropdown", ["Starter", "Pro"]],
    ["score", "number", []],
    ["joined", "date", []],
    ["company", "text", []],
  ] as const) {
    await createCustomField(ws, { key, label: key, type, options: [...options] });
  }
  const list = await createList(ws, { name: "Keto", description: null });
  if (!list.ok) throw new Error("setup");
  keto = list.list.id;
  vip = (await findOrCreateTag(ws, "VIP")).id;

  // 60 varied subscribers: names, statuses, field values and memberships cycle.
  const statuses = ["subscribed", "subscribed", "pending", "unsubscribed", "bounced"] as const;
  const firstNames = ["Priya", "Sam", null, "priyanka", "Ana"];
  const ketoIds: string[] = [];
  const vipIds: string[] = [];
  for (let i = 0; i < 60; i++) {
    const fields: Record<string, string | number> = {};
    if (i % 3 !== 0) fields.plan = i % 2 ? "Pro" : "Starter";
    if (i % 4 !== 0) fields.score = i * 2;
    if (i % 5 !== 0) fields.joined = `2026-0${(i % 9) + 1}-1${i % 10}`;
    if (i % 6 === 1) fields.company = i % 12 === 1 ? "Acme Inc" : "Globex";
    const created = await createSubscriber(ws, {
      email: `p${i}@${i % 2 ? "gmail.com" : "example.org"}`,
      firstName: firstNames[i % 5]!,
      lastName: null,
      status: statuses[i % 5]!,
      fields,
    });
    if (!created.ok) throw new Error("setup");
    if (i % 3 === 0) ketoIds.push(created.subscriber.id);
    if (i % 7 === 0) vipIds.push(created.subscriber.id);
  }
  const { bulkAddToList } = await import("./bulk");
  await bulkAddToList(ws, { ids: ketoIds }, keto);
  await bulkAddTag(ws, { ids: vipIds }, vip);
  // Older sign-ups for the date-relative conditions.
  await sql`update subscribers set created_at = now() - interval '40 days'
            where workspace_id = ${ws} and email like 'p1%'`;
  // Noise in another workspace that must never be counted.
  await createSubscriber(other, { email: "p1@gmail.com", firstName: "Priya", lastName: null });
});

afterAll(async () => {
  await db.delete(workspaces).where(inArray(workspaces.id, [ws, other]));
  await sql.end();
});

async function manual(where: string, params: unknown[] = []) {
  const [row] = await sql.unsafe(
    `select count(*)::int as n from subscribers s where s.workspace_id = $1 and (${where})`,
    [ws, ...params] as never[],
  );
  return (row as unknown as { n: number }).n;
}

const field = (f: string, op: string, value?: string) => ({
  type: "field" as const,
  field: f,
  op,
  value,
});
const all = (...conditions: SegmentRules["conditions"]): SegmentRules => ({
  match: "all",
  conditions,
});

const cases: [string, () => SegmentRules, string, unknown[]?][] = [
  [
    "first name is Priya (any case)",
    () => all(field("first_name", "equals", "PRIYA")),
    "lower(s.first_name) = 'priya'",
  ],
  [
    "first name is not Priya, including empty",
    () => all(field("first_name", "not_equals", "priya")),
    "coalesce(lower(s.first_name), '') <> 'priya'",
  ],
  [
    "first name contains 'priya'",
    () => all(field("first_name", "contains", "priya")),
    "s.first_name ilike '%priya%'",
  ],
  ["first name is empty", () => all(field("first_name", "is_not_set")), "s.first_name is null"],
  [
    "email ends with gmail.com",
    () => all(field("email", "ends_with", "@gmail.com")),
    "s.email like '%@gmail.com'",
  ],
  [
    "status is subscribed",
    () => all(field("status", "is", "subscribed")),
    "s.status = 'subscribed'",
  ],
  [
    "status is not bounced",
    () => all(field("status", "is_not", "bounced")),
    "s.status <> 'bounced'",
  ],
  ["plan is Pro", () => all(field("custom:plan", "is", "Pro")), "s.fields->>'plan' = 'Pro'"],
  [
    "plan is not Pro, including missing",
    () => all(field("custom:plan", "is_not", "Pro")),
    "coalesce(s.fields->>'plan', '') <> 'Pro'",
  ],
  ["plan is filled in", () => all(field("custom:plan", "is_set")), "s.fields ? 'plan'"],
  [
    "score > 50",
    () => all(field("custom:score", "gt", "50")),
    "(s.fields->>'score')::numeric > 50",
  ],
  [
    "score ≤ 20",
    () => all(field("custom:score", "lte", "20")),
    "(s.fields->>'score')::numeric <= 20",
  ],
  [
    "score ≠ 10, including missing",
    () => all(field("custom:score", "neq", "10")),
    "(s.fields->>'score') is null or (s.fields->>'score')::numeric <> 10",
  ],
  [
    "joined before 2026-05-01",
    () => all(field("custom:joined", "before", "2026-05-01")),
    "(s.fields->>'joined')::date < '2026-05-01'",
  ],
  [
    "joined on 2026-03-12",
    () => all(field("custom:joined", "on", "2026-03-12")),
    "s.fields->>'joined' = '2026-03-12'",
  ],
  [
    "company contains acme",
    () => all(field("custom:company", "contains", "acme")),
    "s.fields->>'company' ilike '%acme%'",
  ],
  [
    "added in the last 30 days",
    () => all(field("created_at", "in_last_days", "30")),
    "s.created_at >= now() - interval '30 days'",
  ],
  [
    "added more than 30 days ago",
    () => all(field("created_at", "more_than_days_ago", "30")),
    "s.created_at < now() - interval '30 days'",
  ],
  [
    "on Keto",
    () => all({ type: "list", op: "in", listId: keto }),
    "exists (select 1 from list_memberships m where m.subscriber_id = s.id and m.list_id = $2)",
    [() => keto],
  ],
  [
    "not tagged VIP",
    () => all({ type: "tag", op: "not_has", tagId: vip }),
    "not exists (select 1 from subscriber_tags t where t.subscriber_id = s.id and t.tag_id = $2)",
    [() => vip],
  ],
  [
    "on Keto AND (score > 50 OR tagged VIP) AND subscribed",
    () =>
      all(
        { type: "list", op: "in", listId: keto },
        {
          type: "group",
          match: "any",
          conditions: [field("custom:score", "gt", "50"), { type: "tag", op: "has", tagId: vip }],
        },
        field("status", "is", "subscribed"),
      ),
    `exists (select 1 from list_memberships m where m.subscriber_id = s.id and m.list_id = $2)
     and ((s.fields->>'score')::numeric > 50
          or exists (select 1 from subscriber_tags t where t.subscriber_id = s.id and t.tag_id = $3))
     and s.status = 'subscribed'`,
    [() => keto, () => vip],
  ],
  [
    "any: plan Starter or email at example.org",
    () => ({
      match: "any",
      conditions: [
        field("custom:plan", "is", "Starter"),
        field("email", "ends_with", "example.org"),
      ],
    }),
    "s.fields->>'plan' = 'Starter' or s.email like '%example.org'",
  ],
];

describe("segment engine counts match hand-written SQL", () => {
  it.each(cases)("%s", async (_, rules, where, params = []) => {
    const expected = await manual(
      where,
      (params as (() => string)[]).map((p) => p()),
    );
    const { count, sample } = await previewSegment(ws, rules());
    expect(count).toBe(expected);
    expect(sample.length).toBe(Math.min(5, expected));
  });

  it("never counts another workspace's subscribers", async () => {
    const { count } = await previewSegment(other, all(field("first_name", "equals", "priya")));
    expect(count).toBe(1);
  });

  it("handles LIKE wildcards in values literally", async () => {
    const { count } = await previewSegment(ws, all(field("email", "contains", "%")));
    expect(count).toBe(0);
  });
});
