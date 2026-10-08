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
    expect(response.headers.get("location")).toBe("https://shop.test/sale?ref=email");
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
    expect(response.headers.get("location")).toBe("https://shop.test/hi?name=Ana%20Mar%C3%ADa");
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
    expect(p95).toBeLessThan(50);
  });
});
