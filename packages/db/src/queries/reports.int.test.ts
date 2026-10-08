import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { campaignReport } from "./reports";

// A campaign with every kind of outcome; the report must agree with counts
// taken straight from the raw tables.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let campaign: string;
const m: Record<string, string> = {};
let l0: string;
let l1: string;

beforeAll(async () => {
  [{ id: ws }] = (await sql`
    insert into workspaces (name, slug) values ('Report', ${`int-report-${run}`}) returning id`) as [
    { id: string },
  ];
  [{ id: campaign }] = (await sql`
    insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text, status, recipient_count)
    values (${ws}, 'Report', 'Hi', 'Acme', 'news', 'x', 'x', 'sent', 10) returning id`) as [
    { id: string },
  ];
  // name, status, extra columns
  const rows: [string, string, string][] = [
    ["hard", "sent", "bounced_at = now(), bounce_type = 'hard'"],
    ["soft", "sent", "bounced_at = now(), bounce_type = 'soft'"],
    [
      "complainer",
      "sent",
      "complained_at = now(), opened_at = now(), clicked_at = now(), revenue = 25.5",
    ],
    [
      "leaver",
      "sent",
      "unsubscribed_at = now(), opened_at = now(), clicked_at = now(), revenue = 10",
    ],
    ["scanned", "sent", "revenue = 0"],
    ["quiet1", "sent", "revenue = 0"],
    ["quiet2", "sent", "revenue = 0"],
    ["failed", "failed", "revenue = 0"],
    ["skip1", "skipped", "revenue = 0"],
    ["skip2", "skipped", "revenue = 0"],
  ];
  for (const [name, status, extra] of rows) {
    const [row] = await sql<{ id: string }[]>`
      insert into messages (workspace_id, campaign_id, email, status)
      values (${ws}, ${campaign}, ${`${name}@example.com`}, ${status}::message_status) returning id`;
    m[name] = row!.id;
    await sql.unsafe(`update messages set ${extra} where id = $1`, [row!.id]);
  }
  [l0, l1] = (
    await sql<{ id: string }[]>`
      insert into links (workspace_id, campaign_id, position, url, label) values
        (${ws}, ${campaign}, 0, 'https://shop.test/a', 'Shop'),
        (${ws}, ${campaign}, 1, 'https://shop.test/b', null)
      returning id`
  ).map((r) => r.id) as [string, string];

  const click = (message: string, link: string, bot = false) =>
    sql`insert into clicks (click_id, workspace_id, campaign_id, message_id, link_id, is_bot)
        values (${`sc${Math.random().toString(36).slice(2, 18)}`}, ${ws}, ${campaign}, ${message}, ${link}, ${bot})`;
  await click(m.complainer!, l0);
  await click(m.complainer!, l0);
  await click(m.complainer!, l1);
  await click(m.leaver!, l0);
  await click(m.scanned!, l0, true);

  const open = (message: string, machine = false) =>
    sql`insert into opens (workspace_id, campaign_id, message_id, is_machine)
        values (${ws}, ${campaign}, ${message}, ${machine})`;
  await open(m.complainer!);
  await open(m.complainer!);
  await open(m.complainer!, true);
  await open(m.leaver!);
  await open(m.scanned!, true);
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
});

describe("campaignReport", () => {
  it("adds up every outcome", async () => {
    const result = await campaignReport(ws, campaign);
    expect(result!.report).toEqual({
      recipients: 10,
      sent: 7,
      failed: 1,
      skipped: 2,
      delivered: 5,
      hardBounces: 1,
      softBounces: 1,
      complaints: 1,
      unsubscribes: 1,
      uniqueOpens: 2,
      opens: 3,
      machineOpens: 2,
      uniqueClicks: 2,
      clicks: 4,
      botClicks: 1,
      revenue: 35.5,
      openRate: 2 / 5,
      clickRate: 2 / 5,
      clickToOpenRate: 1,
    });
    expect(
      result!.links.map(({ position, label, clicks, uniqueClicks, botClicks }) => ({
        position,
        label,
        clicks,
        uniqueClicks,
        botClicks,
      })),
    ).toEqual([
      { position: 0, label: "Shop", clicks: 3, uniqueClicks: 2, botClicks: 1 },
      { position: 1, label: null, clicks: 1, uniqueClicks: 1, botClicks: 0 },
    ]);
  });

  it("matches counts taken straight from the raw tables", async () => {
    const { report, links } = (await campaignReport(ws, campaign))!;
    const one = async (query: Promise<{ n: number }[]>) => (await query)[0]!.n;
    expect(report.sent).toBe(
      await one(
        sql`select count(*)::int as n from messages where campaign_id = ${campaign} and status = 'sent'`,
      ),
    );
    expect(report.delivered).toBe(
      await one(
        sql`select count(*)::int as n from messages where campaign_id = ${campaign} and status = 'sent' and bounced_at is null`,
      ),
    );
    expect(report.clicks).toBe(
      await one(
        sql`select count(*)::int as n from clicks where campaign_id = ${campaign} and not is_bot`,
      ),
    );
    expect(report.uniqueClicks).toBe(
      await one(
        sql`select count(distinct message_id)::int as n from clicks where campaign_id = ${campaign} and not is_bot`,
      ),
    );
    expect(report.opens).toBe(
      await one(
        sql`select count(*)::int as n from opens where campaign_id = ${campaign} and not is_machine`,
      ),
    );
    expect(links.reduce((sum, l) => sum + l.clicks, 0)).toBe(report.clicks);
    expect(links.reduce((sum, l) => sum + l.botClicks, 0)).toBe(report.botClicks);
  });

  it("is null for a campaign in another workspace", async () => {
    expect(await campaignReport("019a0000-0000-7000-8000-000000000000", campaign)).toBeNull();
  });
});
