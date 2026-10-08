import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { attributeConversion } from "./attribution";
import { recordConversion } from "./conversions";

// Every attribution path, against real clicks.

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let other: string;
let campaign1: string;
let campaign2: string;
const msg: Record<string, string> = {};
const sub: Record<string, string> = {};
const DAY = 86_400_000;

async function workspace(name: string) {
  const [row] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values (${name}, ${`int-attr-${name}-${run}`}) returning id`;
  return row!.id;
}

async function campaign(workspaceId: string, name: string) {
  const [row] = await sql<{ id: string }[]>`
    insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text, status)
    values (${workspaceId}, ${name}, 'Hi', 'Acme', 'news', 'x', 'x', 'sent') returning id`;
  return row!.id;
}

async function click(
  clickId: string,
  messageKey: string,
  campaignId: string,
  daysAgo: number,
  bot = false,
) {
  await sql`
    insert into clicks (click_id, workspace_id, campaign_id, message_id, subscriber_id, is_bot, created_at)
    select ${clickId}, workspace_id, ${campaignId}, id, subscriber_id, ${bot},
           now() - make_interval(secs => ${daysAgo * 86400})
    from messages where id = ${msg[messageKey]!}`;
}

beforeAll(async () => {
  ws = await workspace("main");
  other = await workspace("other");
  campaign1 = await campaign(ws, "Launch");
  campaign2 = await campaign(ws, "Follow-up");
  for (const name of ["ana", "bo", "cy"]) {
    const [row] = await sql<{ id: string }[]>`
      insert into subscribers (workspace_id, email, status)
      values (${ws}, ${`${name}@example.com`}, 'subscribed') returning id`;
    sub[name] = row!.id;
  }
  const message = async (key: string, campaignId: string, subscriber: string) => {
    const [row] = await sql<{ id: string }[]>`
      insert into messages (workspace_id, campaign_id, subscriber_id, email, status)
      values (${ws}, ${campaignId}, ${sub[subscriber]!}, ${`${subscriber}@example.com`}, 'sent')
      returning id`;
    msg[key] = row!.id;
  };
  await message("ana1", campaign1, "ana");
  await message("ana2", campaign2, "ana");
  await message("bo1", campaign1, "bo");

  // Ana clicked campaign 1 two days ago; a scanner "clicked" campaign 2 an hour ago.
  await click(`scAna1${run}`, "ana1", campaign1, 2);
  await click(`scBot2${run}`, "ana2", campaign2, 1 / 24, true);
  // Bo's only click was ten days ago.
  await click(`scBo1${run}`, "bo1", campaign1, 10);

  // A click in another workspace.
  const otherCampaign = await campaign(other, "Theirs");
  await sql`insert into clicks (click_id, workspace_id, campaign_id) values (${`scOther${run}`}, ${other}, ${otherCampaign})`;
});

afterAll(async () => {
  await sql`delete from workspaces where id in (${ws}, ${other})`;
  await sql.end();
});

describe("attributeConversion", () => {
  it("credits the click the conversion came with", async () => {
    expect(await attributeConversion(ws, { clickId: `scAna1${run}` })).toMatchObject({
      method: "click",
      messageId: msg.ana1,
      campaignId: campaign1,
      subscriberId: sub.ana,
    });
  });

  it("falls back to the buyer's last click by a person, ignoring scanners", async () => {
    expect(
      await attributeConversion(ws, { clickId: "scUnknown", email: " ANA@example.com " }),
    ).toMatchObject({
      method: "email",
      messageId: msg.ana1,
      campaignId: campaign1,
      subscriberId: sub.ana,
    });
  });

  it("only looks back within the attribution window", async () => {
    expect(await attributeConversion(ws, { email: "bo@example.com" })).toMatchObject({
      method: "subscriber",
      campaignId: null,
      subscriberId: sub.bo,
    });
    await sql`insert into tracking_settings (workspace_id, attribution_window_days) values (${ws}, 14)`;
    expect(await attributeConversion(ws, { email: "bo@example.com" })).toMatchObject({
      method: "email",
      messageId: msg.bo1,
    });
    await sql`delete from tracking_settings where workspace_id = ${ws}`;
  });

  it("only counts clicks before the conversion happened", async () => {
    expect(
      await attributeConversion(ws, {
        email: "ana@example.com",
        occurredAt: new Date(Date.now() - 3 * DAY),
      }),
    ).toMatchObject({ method: "subscriber", campaignId: null });
  });

  it("credits a known subscriber without clicks to them alone", async () => {
    expect(await attributeConversion(ws, { email: "cy@example.com" })).toMatchObject({
      method: "subscriber",
      subscriberId: sub.cy,
      messageId: null,
    });
  });

  it("credits nobody for strangers, or other workspaces' clicks", async () => {
    expect((await attributeConversion(ws, { email: "stranger@example.com" })).method).toBe("none");
    expect((await attributeConversion(ws, {})).method).toBe("none");
    expect((await attributeConversion(ws, { clickId: `scOther${run}` })).method).toBe("none");
  });
});

describe("revenue on the credited email", () => {
  const revenue = async () =>
    Number(
      (await sql<{ revenue: string }[]>`select revenue from messages where id = ${msg.ana1!}`)[0]!
        .revenue,
    );
  const sale = (
    txid: string,
    value: number,
    status: "approved" | "pending" | "rejected" | "reversed",
  ) =>
    recordConversion(ws, {
      source: "postback",
      clickId: `scAna1${run}`,
      value,
      currency: "USD",
      status,
      event: "sale",
      txid,
      network: null,
      payload: {},
    });

  it("adds approved sales, and takes back reversed ones", async () => {
    await sale("R-1", 30, "approved");
    expect(await revenue()).toBe(30);
    await sale("R-2", 20, "approved");
    await sale("R-3", 99, "pending");
    await sale("R-4", 50, "rejected");
    expect(await revenue()).toBe(50);
    await sale("R-1", 30, "reversed");
    expect(await revenue()).toBe(20);
    await sale("R-3", 99, "approved");
    expect(await revenue()).toBe(119);
  });

  it("credits a sale matched by email in the same way", async () => {
    const result = await recordConversion(ws, {
      source: "shopify",
      clickId: null,
      email: "ana@example.com",
      value: 1,
      currency: "USD",
      status: "approved",
      event: "sale",
      txid: "R-5",
      network: null,
      payload: {},
    });
    expect(result).toMatchObject({ result: "created", method: "email" });
    expect(await revenue()).toBe(120);
  });
});
