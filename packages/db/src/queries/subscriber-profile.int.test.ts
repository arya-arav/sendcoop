import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { getSubscriberProfile, subscriberTimeline } from "./subscriber-profile";

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let other: string;
let subscriberId: string;

beforeAll(async () => {
  const rows = await sql<{ id: string }[]>`
    insert into workspaces (name, slug)
    values ('Profile', ${`int-profile-${run}`}), ('Other', ${`int-profile-o-${run}`})
    returning id`;
  [ws, other] = rows.map((r) => r.id) as [string, string];
  const [s] = await sql<{ id: string }[]>`
    insert into subscribers (workspace_id, email, first_name, status, source, subscribed_at)
    values (${ws}, 'journey@example.com', 'Jo', 'subscribed', 'form', now() - interval '5 days')
    returning id`;
  subscriberId = s!.id;
  const [list] = await sql<{ id: string }[]>`
    insert into lists (workspace_id, name) values (${ws}, 'Readers') returning id`;
  await sql`insert into list_memberships (list_id, subscriber_id) values (${list!.id}, ${subscriberId})`;
  const [c] = await sql<{ id: string }[]>`
    insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text, status)
    values (${ws}, 'Launch', 'Hi', 'Acme', 'news', 'x', 'x', 'sent') returning id`;
  const [m] = await sql<{ id: string }[]>`
    insert into messages (workspace_id, campaign_id, subscriber_id, email, status, sent_at,
                          opened_at, clicked_at)
    values (${ws}, ${c!.id}, ${subscriberId}, 'journey@example.com', 'sent',
            now() - interval '4 days', now() - interval '3 days', now() - interval '2 days')
    returning id`;
  const [l] = await sql<{ id: string }[]>`
    insert into links (workspace_id, campaign_id, variant, position, url, label, is_affiliate)
    values (${ws}, ${c!.id}, 'a', 0, 'https://shop.example/boots', 'Boots', false) returning id`;
  await sql`
    insert into opens (workspace_id, campaign_id, message_id, subscriber_id, is_machine, created_at)
    values (${ws}, ${c!.id}, ${m!.id}, ${subscriberId}, false, now() - interval '3 days'),
           (${ws}, ${c!.id}, ${m!.id}, ${subscriberId}, true, now() - interval '3 days')`;
  await sql`
    insert into clicks (click_id, workspace_id, campaign_id, message_id, subscriber_id, link_id,
                        is_bot, created_at)
    values (${`sc${run}prof00000`.slice(0, 18)}, ${ws}, ${c!.id}, ${m!.id}, ${subscriberId},
            ${l!.id}, false, now() - interval '2 days'),
           (${`sc${run}prof11111`.slice(0, 18)}, ${ws}, ${c!.id}, ${m!.id}, ${subscriberId},
            ${l!.id}, true, now() - interval '2 days')`;
  await sql`
    insert into conversions (workspace_id, campaign_id, message_id, subscriber_id, source, event,
                             value, currency, status, external_txid, created_at, fx_rate)
    values (${ws}, ${c!.id}, ${m!.id}, ${subscriberId}, 'shopify', 'sale', 120, 'USD',
            'approved', 'p1', now() - interval '1 day', 1),
           (${ws}, ${c!.id}, ${m!.id}, ${subscriberId}, 'pixel', 'sale', 40, 'USD',
            'pending', 'p2', now() - interval '12 hours', 1),
           (${ws}, ${c!.id}, ${m!.id}, ${subscriberId}, 'pixel', 'sale', 99, 'USD',
            'reversed', 'p3', now() - interval '6 hours', 1)`;
});

afterAll(async () => {
  await sql`delete from workspaces where id in (${ws}, ${other})`;
});

describe("subscriber profile", () => {
  it("adds up lifetime value from approved conversions only", async () => {
    const profile = await getSubscriberProfile(ws, subscriberId);
    expect(profile).toMatchObject({
      email: "journey@example.com",
      firstName: "Jo",
      lists: [{ name: "Readers" }],
      tags: [],
      stats: {
        emails: 1,
        opened: 1,
        clicked: 1,
        conversions: 1,
        lifetimeValue: 120,
        pendingValue: 40,
      },
    });
    expect(profile!.stats.lastActivity).toBeGreaterThan(Date.now() - 7 * 3_600_000);
  });

  it("shows the whole journey, newest first, without machines", async () => {
    const events = await subscriberTimeline(ws, subscriberId);
    expect(events.map((e) => e.kind)).toEqual([
      "converted",
      "converted",
      "converted",
      "clicked",
      "opened",
      "sent",
      "subscribed",
    ]);
    expect(events.find((e) => e.kind === "clicked")).toMatchObject({
      campaignName: "Launch",
      detail: "Boots",
    });
    expect(events[2]).toMatchObject({ detail: "shopify sale", value: 120, status: "approved" });
  });

  it("is only visible in its own workspace", async () => {
    expect(await getSubscriberProfile(other, subscriberId)).toBeNull();
    expect(await subscriberTimeline(other, subscriberId)).toEqual([]);
    expect(await getSubscriberProfile(ws, "not-a-uuid")).toBeNull();
  });
});
