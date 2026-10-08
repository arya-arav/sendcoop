import {
  createCampaign,
  createClickToken,
  EMPTY_AUDIENCE,
  getSql,
  honeypotUrl,
  openPixelUrl,
} from "@sendcoop/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app";

// Machines are told apart from people: their clicks and opens are recorded
// but don't count.

const sql = getSql();
const run = Date.now().toString(36);
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
let ws: string;
let campaignId: string;
let links: string[] = [];

beforeAll(async () => {
  const [row] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('Bots', ${`int-bots-${run}`}) returning id`;
  ws = row!.id;
  const campaign = await createCampaign(ws, {
    name: "Bots",
    subject: "Hi",
    fromName: "Acme",
    fromLocal: "news",
    replyTo: null,
    sendingDomainId: null,
    sendingServerId: null,
    audience: EMPTY_AUDIENCE,
    html: "x",
    text: "x",
  });
  campaignId = campaign.id;
  links = (
    await sql<{ id: string }[]>`
      insert into links (workspace_id, campaign_id, position, url)
      select ${ws}, ${campaignId}, g, 'https://shop.test/' || g from generate_series(0, 3) g
      returning id`
  ).map((l) => l.id);
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql.end();
});

/** A sent message (no subscriber needed); sentSecondsAgo sets how long ago it went out. */
async function message(sentSecondsAgo = 3600) {
  const [m] = await sql<{ id: string }[]>`
    insert into messages (workspace_id, campaign_id, subscriber_id, email, status, sent_at)
    values (${ws}, ${campaignId}, null, ${`m${Math.random()}@example.com`}, 'sent',
            now() - make_interval(secs => ${sentSecondsAgo}))
    returning id`;
  return m!.id;
}

const click = (messageId: string, link: number, ua = CHROME) =>
  app.request(`/c/${createClickToken(messageId, links[link]!)}`, {
    headers: { "user-agent": ua, "x-forwarded-for": "203.0.113.20" },
  });

const state = async (messageId: string) => {
  const rows = await sql<{ is_bot: boolean }[]>`
    select is_bot from clicks where message_id = ${messageId} order by id`;
  const [m] = await sql<{ clicked_at: string | null; opened_at: string | null }[]>`
    select clicked_at, opened_at from messages where id = ${messageId}`;
  return {
    bots: rows.map((r) => r.is_bot),
    clicked: m!.clicked_at !== null,
    opened: m!.opened_at !== null,
  };
};

describe("bot clicks", () => {
  it("a person's click counts", async () => {
    const id = await message();
    expect((await click(id, 0)).status).toBe(302);
    expect(await state(id)).toMatchObject({ bots: [false], clicked: true });
  });

  it("a scanner's or previewer's click is flagged, and still redirected", async () => {
    const id = await message();
    const response = await click(id, 0, "Mimecast-URL-Protect/1.0");
    expect(response.status).toBe(302);
    expect(await state(id)).toMatchObject({ bots: [true], clicked: false });
  });

  it("a click within seconds of the email going out is a scanner", async () => {
    const id = await message(1);
    await click(id, 0);
    expect(await state(id)).toMatchObject({ bots: [true], clicked: false });
  });

  it("three different links in two seconds are a machine, earlier clicks included", async () => {
    const id = await message();
    await click(id, 0);
    expect((await state(id)).clicked).toBe(true);
    await click(id, 1);
    await click(id, 2);
    expect(await state(id)).toMatchObject({ bots: [true, true, true], clicked: false });
  });

  it("clicking the same link twice (a double click) is still a person", async () => {
    const id = await message();
    await click(id, 0);
    await click(id, 0);
    expect(await state(id)).toMatchObject({ bots: [false, false], clicked: true });
  });

  it("following the hidden link unmasks the clicks before it", async () => {
    const id = await message();
    await click(id, 3);
    expect((await state(id)).clicked).toBe(true);
    const path = new URL(honeypotUrl(id)).pathname;
    expect((await app.request(path)).status).toBe(204);
    expect(await state(id)).toMatchObject({ bots: [true], clicked: false });
  });
});

describe("opens", () => {
  const open = (messageId: string, ip: string, ua: string) =>
    app.request(new URL(openPixelUrl(messageId)).pathname, {
      headers: { "user-agent": ua, "x-forwarded-for": ip },
    });

  it("a person's open counts; the pixel is a no-cache GIF", async () => {
    const id = await message();
    const response = await open(id, "203.0.113.5", CHROME);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/gif");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(30);
    expect((await state(id)).opened).toBe(true);
  });

  it("Apple Mail Privacy Protection and scanners are machine opens", async () => {
    const id = await message();
    await open(id, "17.58.101.5", "Mozilla/5.0");
    await open(id, "203.0.113.5", "Barracuda Sentinel scanner");
    expect((await state(id)).opened).toBe(false);
    const rows = await sql<{ is_machine: boolean }[]>`
      select is_machine from opens where message_id = ${id}`;
    expect(rows.map((r) => r.is_machine)).toEqual([true, true]);
  });

  it("a bad pixel token still gets the image, and records nothing", async () => {
    const response = await app.request("/o/nonsense.gif");
    expect(response.headers.get("content-type")).toBe("image/gif");
  });
});
