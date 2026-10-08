import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "../client";
import { recordConversion } from "./conversions";
import { countUnconvertedConversions, setReportingCurrency, storeFxRates } from "./currency";
import { revenueReport } from "./revenue";

// A workspace reporting in euros gets sales in dollars, pounds and XTS (the
// ISO code for tests, which no bank publishes); a refund comes later. Rates
// are for a day in 2001 so that real ones (the worker loads today's) never
// get in the way.

const sql = getSql();
const run = Date.now().toString(36);
const DAY = "2001-01-01";
const AT = new Date("2001-01-02T12:00:00Z");
let ws: string;
let messageId: string;
const clickId = `sc${run.padEnd(16, "f").slice(0, 16)}`;
const ALL = { from: null, to: new Date(Date.now() + 86_400_000) };

beforeAll(async () => {
  await sql`delete from fx_rates where day = ${DAY}`;
  await storeFxRates(DAY, { USD: 1.1, GBP: 0.8 });
  const [w] = await sql<{ id: string }[]>`
    insert into workspaces (name, slug) values ('FX', ${`int-fx-${run}`}) returning id`;
  ws = w!.id;
  await setReportingCurrency(ws, "EUR");
  const [c] = await sql<{ id: string }[]>`
    insert into campaigns (workspace_id, name, subject, from_name, from_local, html, text, status)
    values (${ws}, 'Global', 'Hi', 'Acme', 'news', 'x', 'x', 'sent') returning id`;
  const [m] = await sql<{ id: string }[]>`
    insert into messages (workspace_id, campaign_id, email, status, sent_at)
    values (${ws}, ${c!.id}, 'fx@example.com', 'sent', ${AT.toISOString()}) returning id`;
  messageId = m!.id;
  await sql`insert into clicks (click_id, workspace_id, campaign_id, message_id, created_at)
            values (${clickId}, ${ws}, ${c!.id}, ${messageId}, ${AT.toISOString()})`;
});

afterAll(async () => {
  await sql`delete from workspaces where id = ${ws}`;
  await sql`delete from fx_rates where day = ${DAY}`;
});

const sale = (txid: string, value: number, currency: string, status = "approved" as const) =>
  recordConversion(ws, {
    source: "postback",
    clickId,
    occurredAt: AT,
    value,
    currency,
    status,
    event: "sale",
    txid,
    network: null,
    payload: {},
  });
const revenue = async () => {
  const [m] = await sql<{ revenue: number }[]>`
    select revenue::float8 as revenue from messages where id = ${messageId}`;
  return m!.revenue;
};
const base = async (txid: string) => {
  const [v] = await sql<{ value: number; currency: string; value_base: number | null }[]>`
    select value::float8 as value, currency, value_base::float8 as value_base from conversions
    where workspace_id = ${ws} and external_txid = ${txid}`;
  return v;
};

describe("currencies", () => {
  it("converts each sale to the reporting currency at its day's rate, keeping the original", async () => {
    await sale("usd", 110, "USD");
    await sale("gbp", 80, "GBP");
    await sale("eur", 25, "EUR");
    expect(await base("usd")).toEqual({ value: 110, currency: "USD", value_base: 100 });
    expect(await base("gbp")).toEqual({ value: 80, currency: "GBP", value_base: 100 });
    expect(await base("eur")).toEqual({ value: 25, currency: "EUR", value_base: 25 });
    expect(await revenue()).toBe(225);
    expect((await revenueReport(ws, "campaign", ALL)).totals.revenue).toBe(225);
  });

  it("leaves out a currency without a rate until one arrives", async () => {
    await sale("xts", 16_000, "XTS");
    expect((await base("xts"))!.value_base).toBeNull();
    expect(await countUnconvertedConversions(ws)).toBe(1);
    expect(await revenue()).toBe(225);

    const stored = await storeFxRates(DAY, { XTS: 160 });
    expect(stored.converted).toBeGreaterThanOrEqual(1);
    expect((await base("xts"))!.value_base).toBe(100);
    expect(await countUnconvertedConversions(ws)).toBe(0);
    expect(await revenue()).toBe(325);
  });

  it("a reversed postback lowers revenue", async () => {
    expect((await sale("usd", 110, "USD", "reversed" as never)).result).toBe("updated");
    expect(await revenue()).toBe(225);
    expect((await revenueReport(ws, "campaign", ALL)).totals.revenue).toBe(225);
  });

  it("switching the reporting currency converts everything again", async () => {
    await setReportingCurrency(ws, "USD");
    expect(await base("eur")).toMatchObject({ value_base: 27.5 });
    expect(await base("gbp")).toMatchObject({ value_base: 110 });
    // GBP 110 + EUR 27.50 + XTS 110 (the reversed USD sale doesn't count)
    expect(await revenue()).toBe(247.5);
  });
});
