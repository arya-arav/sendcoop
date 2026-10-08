// Seeds campaigns, sends, clicks and sales into a workspace, for the
// dashboard and reports with realistic volumes.
//   pnpm --filter @sendcoop/db seed:revenue <workspace-slug> [messages=200000]
// 20 campaigns over the last 60 days, three links each (eight offers
// shared between them), ~5% clicking and ~10% of clickers buying.
// Generated in SQL, so 200k messages take seconds.
import { getSql } from "../client";

const [slug, countArg = "200000"] = process.argv.slice(2);
const total = Number(countArg);
if (!slug || !Number.isInteger(total) || total < 20 || total > 5_000_000) {
  console.error("Usage: seed:revenue <workspace-slug> [messages, 20 to 5000000]");
  process.exit(1);
}

const sql = getSql();
const OFFERS = [
  ["https://vendor1.hop.clickbank.net/", "clickbank"],
  ["https://www.digistore24.com/redir/1234/aff/", "digistore24"],
  ["https://shop.example.com/products/boots", null],
  ["https://shop.example.com/products/jacket", null],
  ["https://partner.sjv.io/c/1/2/3", "impact"],
  ["https://www.awin1.com/cread.php", "awin"],
  ["https://shop.example.com/collections/sale", null],
  ["https://course.example.com/enroll", null],
] as const;

try {
  const [workspace] = await sql<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  if (!workspace) throw new Error(`No workspace with slug "${slug}"`);
  const ws = workspace.id;
  const started = performance.now();
  const batch = Date.now().toString(36);
  const perCampaign = Math.floor(total / 20);

  for (let i = 0; i < 20; i++) {
    const daysAgo = 58 - i * 3;
    const [campaign] = await sql<{ id: string }[]>`
      insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text,
                             status, started_at, finished_at, recipient_count, sent_count)
      values (${ws}, ${`Seed ${batch} #${i + 1}`}, 'Seeded', 'Seed', 'news', 'x', 'x', 'sent',
              now() - make_interval(days => ${daysAgo}), now() - make_interval(days => ${daysAgo}),
              ${perCampaign}, ${perCampaign})
      returning id`;
    const c = campaign!.id;
    for (let p = 0; p < 3; p++) {
      const [url, network] = OFFERS[(i + p * 3) % OFFERS.length]!;
      await sql`
        insert into links (workspace_id, campaign_id, variant, position, url, is_affiliate, network_id)
        values (${ws}, ${c}, 'a', ${p}, ${url}, ${network !== null}, ${network})`;
    }
    await sql`
      insert into messages (workspace_id, campaign_id, email, status, sent_at)
      select ${ws}, ${c}, ${`seed-${batch}-${i}-`} || n || '@example.com', 'sent',
             now() - make_interval(days => ${daysAgo}) + (n % 3600) * interval '1 second'
      from generate_series(1, ${perCampaign}) n`;
    // ~5% click (people), 1 in 4 of those also triggers a scanner click
    await sql`
      insert into clicks (click_id, workspace_id, campaign_id, message_id, link_id, is_bot, created_at)
      select 'sc' || substr(md5(m.id::text || 'k'), 1, 16), ${ws}, ${c}, m.id,
             (select id from links where campaign_id = ${c} and position = (hashtext(m.id::text) & 2)),
             false, m.sent_at + interval '2 hours'
      from messages m where m.campaign_id = ${c} and hashtext(m.id::text) % 20 = 0`;
    await sql`update messages m set clicked_at = k.created_at from clicks k
              where k.message_id = m.id and m.campaign_id = ${c}`;
    // ~10% of clickers buy, spread over the days after
    await sql`
      insert into conversions (workspace_id, click_id, click_row_id, message_id, campaign_id, source,
                               event, value, currency, status, external_txid, created_at, fx_rate)
      select ${ws}, k.click_id, k.id, k.message_id, ${c}, 'postback', 'sale',
             (20 + abs(hashtext(k.id::text)) % 180)::numeric, 'USD',
             case when abs(hashtext(k.id::text)) % 25 = 0 then 'reversed' else 'approved' end::conversion_status,
             ${`seed-${batch}-`} || k.id, k.created_at + (abs(hashtext(k.click_id)) % 72) * interval '1 hour', 1
      from clicks k where k.campaign_id = ${c} and abs(hashtext(k.click_id)) % 10 = 0`;
    await sql`
      update messages m set revenue = s.total
      from (select message_id, sum(value_base) as total from conversions
            where campaign_id = ${c} and status = 'approved' group by message_id) s
      where m.id = s.message_id`;
  }
  const [counts] = await sql<{ m: number; k: number; v: number }[]>`
    select (select count(*) from messages where workspace_id = ${ws})::int as m,
           (select count(*) from clicks where workspace_id = ${ws})::int as k,
           (select count(*) from conversions where workspace_id = ${ws})::int as v`;
  console.log(
    `Seeded into ${slug}: ${counts!.m} messages, ${counts!.k} clicks, ${counts!.v} conversions in ${Math.round(performance.now() - started)} ms`,
  );
} finally {
  await sql.end();
}
