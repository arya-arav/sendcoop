import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { parseUtmcapStatus, recordUtmcapConversion, sendcoopClickForUtmcap } from "./utmcap";

const sql = getSql();
const run = Date.now().toString(36);
let ws: string;
let campaignId: string;
let messageId: string;
const clickId = `sc${run.padEnd(16, "u").slice(0, 16)}`;
const ucid = `UC${run.toUpperCase().padEnd(24, "X")}`;

beforeAll(async () => {
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('UTMCAP conv', ${`int-utmcap-${run}`}) returning id`;
  ws = w!.id;
  const [c] = await sql<{ id: string }[]>`
    insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text, status)
    values (${ws}, 'Keto', 'Hi', 'Acme', 'news', 'x', 'x', 'sent') returning id`;
  campaignId = c!.id;
  const [m] = await sql<{ id: string }[]>`
    insert into messages (workspace_id, campaign_id, email, status, sent_at)
    values (${ws}, ${campaignId}, 'u@example.com', 'sent', now()) returning id`;
  messageId = m!.id;
  await sql`insert into clicks (click_id, workspace_id, campaign_id, message_id)
            values (${clickId}, ${ws}, ${campaignId}, ${messageId})`;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
});

const state = async () => {
  const rows = await sql<
    { external_txid: string; status: string; value: number; campaign_id: string }[]
  >`
    select external_txid, status, value::float8 as value, campaign_id from conversions
    where workspace_id = ${ws} order by created_at`;
  const [m] = await sql<{ revenue: number }[]>`
    select revenue::float8 as revenue from messages where id = ${messageId}`;
  return { rows, revenue: m!.revenue };
};

const postback = (status = "approved", value = 40) =>
  recordUtmcapConversion(ws, {
    ucid,
    clickId,
    conversionId: null,
    value,
    currency: "USD",
    status: parseUtmcapStatus(status),
    via: "postback",
    payload: {},
  });
const webhook = (conversionId: string, status: string, value = 40) =>
  recordUtmcapConversion(ws, {
    ucid,
    clickId: null,
    conversionId,
    value,
    currency: "USD",
    status: parseUtmcapStatus(status),
    via: "webhook",
    payload: { status },
  });

describe("UTMCAP statuses", () => {
  it("follow UTMCAP's own mapping", () => {
    expect(parseUtmcapStatus(undefined)).toBe("approved");
    expect(parseUtmcapStatus("Sale")).toBe("approved");
    expect(parseUtmcapStatus("declined")).toBe("rejected");
    expect(parseUtmcapStatus("chargeback")).toBe("reversed");
    expect(parseUtmcapStatus("hold")).toBe("pending");
    expect(parseUtmcapStatus("whatever")).toBe("pending");
  });
});

describe("UTMCAP conversions", () => {
  it("a postback credits the email click and remembers UTMCAP's click id", async () => {
    expect(await postback()).toMatchObject({ result: "created" });
    expect(await sendcoopClickForUtmcap(ws, ucid)).toBe(clickId);
    expect(await state()).toEqual({
      rows: [
        { external_txid: `utmcap:${ucid}`, status: "approved", value: 40, campaign_id: campaignId },
      ],
      revenue: 40,
    });
    expect(await postback()).toMatchObject({ result: "duplicate" });
  });

  it("the webhook names it, without counting it twice", async () => {
    expect(await webhook("ORDER-1", "approved")).toMatchObject({ result: "updated" });
    expect((await state()).rows).toEqual([
      expect.objectContaining({ external_txid: `utmcap:${ucid}:ORDER-1`, value: 40 }),
    ]);
    // A late postback for the same conversion changes nothing
    expect(await postback()).toMatchObject({ result: "duplicate" });
    expect((await state()).rows).toHaveLength(1);
  });

  it("a chargeback in UTMCAP takes the revenue back", async () => {
    expect(await webhook("ORDER-1", "chargeback")).toMatchObject({ result: "updated" });
    expect(await state()).toMatchObject({ rows: [{ status: "reversed" }], revenue: 0 });
  });

  it("another conversion on the same click is its own, credited through the remembered click", async () => {
    expect(await webhook("ORDER-2", "approved", 15)).toMatchObject({ result: "created" });
    expect(await state()).toMatchObject({
      rows: [
        { external_txid: `utmcap:${ucid}:ORDER-1` },
        { external_txid: `utmcap:${ucid}:ORDER-2`, value: 15, campaign_id: campaignId },
      ],
      revenue: 15,
    });
  });
});
