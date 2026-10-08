import { createCampaign, createClickToken, EMPTY_AUDIENCE, getSql } from "@sendcoop/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app";

// The click redirect against a real database: correctness and speed.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let messageId: string;
let linkId: string;
let mergeLinkId: string;
let otherLinkId: string;
let clickbankId: string;
let impactId: string;

beforeAll(async () => {
  const [row] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Clicks', ${`int-clicks-${run}`}) returning id`;
  ws = row!.id;
  const [sub] = await sql<{ id: string }[]>`
    insert into subscribers (workspace_id, email, first_name, status)
    values (${ws}, 'ana@example.com', 'Ana María', 'subscribed') returning id`;
  const settings = {
    fromName: "Acme",
    fromLocal: "news",
    replyTo: null,
    sendingDomainId: null,
    sendingServerId: null,
    audience: EMPTY_AUDIENCE,
    html: "x",
    text: "x",
  };
  const campaign = await createCampaign(ws, { ...settings, name: "Clicks", subject: "Hi" });
  const other = await createCampaign(ws, { ...settings, name: "Other", subject: "Hi" });
  const [message] = await sql<{ id: string }[]>`
    insert into messages (workspace_id, campaign_id, subscriber_id, email, status)
    values (${ws}, ${campaign.id}, ${sub!.id}, 'ana@example.com', 'sent') returning id`;
  messageId = message!.id;
  const links = await sql<{ id: string }[]>`
    insert into links (workspace_id, campaign_id, position, url) values
      (${ws}, ${campaign.id}, 0, 'https://shop.test/sale?ref=email'),
      (${ws}, ${campaign.id}, 1, 'https://shop.test/hi?name={{first_name | friend}}'),
      (${ws}, ${other.id}, 0, 'https://other.test/')
    returning id`;
  [linkId, mergeLinkId, otherLinkId] = links.map((l) => l.id) as [string, string, string];
  const affiliate = await sql<{ id: string }[]>`
    insert into links (workspace_id, campaign_id, position, url, label, is_affiliate, network_id) values
      (${ws}, ${campaign.id}, 2, 'https://vendor.hop.clickbank.net/?affiliate=myaff', 'Get it', true, 'clickbank'),
      (${ws}, ${campaign.id}, 3, 'https://brand.sjv.io/c/1234/567890/12345', 'Shop', true, 'impact')
    returning id`;
  [clickbankId, impactId] = affiliate.map((l) => l.id) as [string, string];
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
});

const click = (token: string, ua = "Mozilla/5.0 (test)") =>
  app.request(`/c/${token}`, {
    headers: { "user-agent": ua, "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
  });

describe("GET /c/:token", () => {
  it("records the click and redirects to the link", async () => {
    const response = await click(createClickToken(messageId, linkId));
    expect(response.status).toBe(302);
    const [last] = await sql<{ click_id: string }[]>`
      select click_id from clicks where message_id = ${messageId} order by id desc limit 1`;
    // UTM tags for the campaign and link, and the click id as sc_cid.
    expect(response.headers.get("location")).toBe(
      `https://shop.test/sale?ref=email&utm_source=sendcoop&utm_medium=email&utm_campaign=clicks&utm_content=link-1&sc_cid=${last!.click_id}`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");

    const [row] = await sql<
      { click_id: string; ip: string; user_agent: string; campaign_id: string }[]
    >`
      select click_id, ip, user_agent, campaign_id from clicks where message_id = ${messageId}`;
    expect(row!.click_id).toMatch(/^sc[0-9A-Za-z]{16}$/);
    expect(row!.ip).toBe("203.0.113.7");
    expect(row!.user_agent).toBe("Mozilla/5.0 (test)");
    const [message] = await sql<{ clicked_at: Date | null }[]>`
      select clicked_at from messages where id = ${messageId}`;
    expect(message!.clicked_at).not.toBeNull();
  });

  it("fills in merge tags in the link, URL-encoded", async () => {
    const response = await click(createClickToken(messageId, mergeLinkId));
    expect(response.headers.get("location")).toMatch(
      /^https:\/\/shop\.test\/hi\?name=Ana\+Mar%C3%ADa&utm_source=/,
    );
  });

  it("puts the click id in ClickBank's and Impact's sub-id, and nothing else", async () => {
    const latestClickId = async () =>
      (
        await sql<{ click_id: string }[]>`
          select click_id from clicks where message_id = ${messageId} order by id desc limit 1`
      )[0]!.click_id;
    const clickbank = await click(createClickToken(messageId, clickbankId));
    expect(clickbank.headers.get("location")).toBe(
      `https://vendor.hop.clickbank.net/?affiliate=myaff&tid=${await latestClickId()}`,
    );
    const impact = await click(createClickToken(messageId, impactId));
    expect(impact.headers.get("location")).toBe(
      `https://brand.sjv.io/c/1234/567890/12345?subId1=${await latestClickId()}`,
    );
  });

  it("follows the workspace's tracking settings", async () => {
    await sql`insert into tracking_settings (workspace_id, add_utm, utm_source) values (${ws}, false, 'newsletter')`;
    const response = await click(createClickToken(messageId, linkId));
    expect(response.headers.get("location")).toMatch(
      /^https:\/\/shop\.test\/sale\?ref=email&sc_cid=sc[0-9A-Za-z]{16}$/,
    );
    await sql`update tracking_settings set add_utm = true where workspace_id = ${ws}`;
    const tagged = await click(createClickToken(messageId, linkId));
    expect(tagged.headers.get("location")).toContain("utm_source=newsletter");
  });

  it("refuses tampered tokens and links from another campaign", async () => {
    const token = createClickToken(messageId, linkId);
    const tampered = `${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`;
    for (const bad of [tampered, "nonsense", createClickToken(messageId, otherLinkId)]) {
      const response = await click(bad);
      expect(response.status).toBe(404);
      expect(await response.text()).toContain("This link doesn't work");
    }
  });

  it("redirects in well under 50ms", async () => {
    const token = createClickToken(messageId, linkId);
    for (let i = 0; i < 5; i++) await click(token); // warm up connections
    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      const started = performance.now();
      const response = await click(token);
      times.push(performance.now() - started);
      expect(response.status).toBe(302);
    }
    times.sort((a, b) => a - b);
    const p50 = times[24]!;
    const p95 = times[47]!;
    console.log(`[edge] click redirect: p50 ${p50.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms`);
    expect(p50).toBeLessThan(50);
    // Shared CI runners (with other test suites running alongside) have
    // occasional pauses; the 95th percentile is checked on real machines.
    if (!process.env.CI) expect(p95).toBeLessThan(50);
  });
});
