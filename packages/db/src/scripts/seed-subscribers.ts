// Seeds realistic subscribers into a workspace for performance testing.
//   pnpm --filter @sendcoop/db seed:subscribers <workspace-slug> [count=100000]
// Generated in SQL (generate_series), so 100k rows take seconds.
import { eq } from "drizzle-orm";
import { getDb, getSql } from "../client";
import { lists, workspaces } from "../schema";

const [slug, countArg = "100000"] = process.argv.slice(2);
const total = Number(countArg);
if (!slug || !Number.isInteger(total) || total < 1 || total > 5_000_000) {
  console.error("Usage: seed:subscribers <workspace-slug> [count up to 5000000]");
  process.exit(1);
}

const db = getDb();
const sql = getSql();

try {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  if (!workspace) throw new Error(`No workspace with slug "${slug}"`);

  // Three lists to spread memberships across (reuses existing ones by name).
  const listIds: string[] = [];
  for (const name of ["Seed: keto buyers", "Seed: webinar leads", "Seed: newsletter"]) {
    const [row] = await db
      .insert(lists)
      .values({ workspaceId: workspace.id, name })
      .onConflictDoNothing()
      .returning({ id: lists.id });
    if (row) listIds.push(row.id);
    else {
      const [existing] = await sql`
        select id from lists where workspace_id = ${workspace.id} and lower(name) = lower(${name})`;
      listIds.push(existing!.id as string);
    }
  }

  const started = performance.now();
  const batch = `seed${Date.now().toString(36)}`;
  // ~90% subscribed; names from small pools; unique emails via the series number.
  // Later rows get later ids (uuidv7) and later dates, so both orders agree.
  const inserted = await sql`
    with first_names as (select array['Priya','Sam','Ana','Jo','Liam','Mia','Noah','Aisha','Chen','Lucas','Sofia','Omar','Emma','Ravi','Yuki','Elena'] as v),
         last_names  as (select array['Sharma','Lee','Garcia','Smith','Khan','Nguyen','Müller','Rossi','Silva','Kim','Brown','Patel','Dubois','Novak'] as v),
         domains     as (select array['gmail.com','yahoo.com','outlook.com','example.com','shop.example','proton.me'] as v)
    insert into subscribers (workspace_id, email, first_name, last_name, status, source, subscribed_at, created_at)
    select ${workspace.id},
           lower(f.v[1 + (g % 16)]) || '.' || translate(lower(l.v[1 + ((g / 16) % 14)]), 'ü', 'u') || '.' || ${batch} || g || '@' || d.v[1 + (g % 6)],
           f.v[1 + (g % 16)],
           l.v[1 + ((g / 16) % 14)],
           (case when g % 20 = 0 then 'unsubscribed' when g % 50 = 1 then 'bounced'
                 when g % 97 = 2 then 'pending' else 'subscribed' end)::subscriber_status,
           (case when g % 3 = 0 then 'import' when g % 3 = 1 then 'form' else 'manual' end)::subscriber_source,
           now() - ((${total} - g) || ' minutes')::interval,
           now() - ((${total} - g) || ' minutes')::interval
    from generate_series(1, ${total}) g, first_names f, last_names l, domains d
    returning id`;

  // About 60% of subscribers on one list, 20% on two.
  await sql`
    insert into list_memberships (list_id, subscriber_id)
    select (${listIds} ::uuid[])[1 + (abs(hashtext(s.id::text)) % 3)], s.id
    from subscribers s
    where s.workspace_id = ${workspace.id} and s.email like ${"%." + batch + "%"}
      and abs(hashtext(s.id::text)) % 10 < 6
    on conflict do nothing`;
  await sql`
    insert into list_memberships (list_id, subscriber_id)
    select (${listIds} ::uuid[])[1 + ((abs(hashtext(s.id::text)) + 1) % 3)], s.id
    from subscribers s
    where s.workspace_id = ${workspace.id} and s.email like ${"%." + batch + "%"}
      and abs(hashtext(s.id::text)) % 10 < 2
    on conflict do nothing`;

  await sql`analyze subscribers`;
  await sql`analyze list_memberships`;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`Seeded ${inserted.length} subscribers into "${slug}" in ${seconds}s`);
} finally {
  await sql.end();
}
