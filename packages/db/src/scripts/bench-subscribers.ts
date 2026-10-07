// Times the subscriber table queries against a seeded workspace.
//   pnpm --filter @sendcoop/db bench:subscribers <workspace-slug>
// Each scenario runs searchSubscribers (page query + total count + lists) and
// reports the median of several runs, the same work as one Contacts page load.
import { eq } from "drizzle-orm";
import { getDb, getSql } from "../client";
import { searchSubscribers, type SubscriberFilters } from "../queries/subscribers";
import { lists, workspaces } from "../schema";

const [slug] = process.argv.slice(2);
if (!slug) {
  console.error("Usage: bench:subscribers <workspace-slug>");
  process.exit(1);
}

const RUNS = 7;
const db = getDb();
const sql = getSql();

try {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  if (!workspace) throw new Error(`No workspace with slug "${slug}"`);
  const [list] = await db.select().from(lists).where(eq(lists.workspaceId, workspace.id));
  const [{ total }] = (await sql`
    select count(*)::int as total from subscribers where workspace_id = ${workspace.id}`) as [
    { total: number },
  ];
  // A cursor halfway through, to show deep pages cost the same as the first.
  const [{ id: middle }] = (await sql`
    select id from subscribers where workspace_id = ${workspace.id}
    order by id desc offset ${Math.floor(total / 2)} limit 1`) as [{ id: string }];
  const [{ email: oneEmail }] = (await sql`
    select email from subscribers where workspace_id = ${workspace.id}
    order by id limit 1 offset ${Math.floor(total / 3)}`) as [{ email: string }];

  const scenarios: [string, { filters?: SubscriberFilters; after?: string }][] = [
    ["First page", {}],
    [`Page in the middle (row ${Math.floor(total / 2).toLocaleString()})`, { after: middle }],
    ["Status: unsubscribed", { filters: { status: "unsubscribed" } }],
    ["List filter", { filters: { listId: list?.id } }],
    ["Search: common name (priya)", { filters: { query: "priya" } }],
    ["Search: exact email", { filters: { query: oneEmail } }],
    ["Search: 2 characters (le)", { filters: { query: "le" } }],
    ["Search: no matches", { filters: { query: "zzqxj" } }],
    [
      "Search + status + list",
      { filters: { query: "sharma", status: "subscribed", listId: list?.id } },
    ],
  ];

  console.log(
    `Workspace "${slug}": ${total.toLocaleString()} subscribers, median of ${RUNS} runs\n`,
  );
  console.log("Scenario".padEnd(44) + "ms".padStart(8) + "matches".padStart(12));
  for (const [name, options] of scenarios) {
    const times: number[] = [];
    let matches = 0;
    for (let i = 0; i < RUNS; i++) {
      const started = performance.now();
      const page = await searchSubscribers(workspace.id, { ...options, limit: 50 });
      times.push(performance.now() - started);
      matches = page.total;
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(RUNS / 2)]!;
    console.log(
      name.padEnd(44) + median.toFixed(1).padStart(8) + matches.toLocaleString().padStart(12),
    );
  }

  console.log("\nPlan for the 'priya' search (page query):");
  const plan = await sql.unsafe(
    `explain (analyze, costs off, timing off, summary off)
     select id from subscribers
     where workspace_id = $1
       and lower(email || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, '')) like '%priya%'
     order by id desc limit 51`,
    [workspace.id],
  );
  for (const row of plan) console.log("  " + (row as Record<string, string>)["QUERY PLAN"]);
} finally {
  await sql.end();
}
