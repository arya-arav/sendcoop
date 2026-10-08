import { sql } from "drizzle-orm";
import { getDb } from "../client";
import { trackingSettings } from "../schema";

// Currencies (D54). Each conversion keeps the amount and currency it was
// reported in, plus the rate to the workspace's reporting currency on the
// day it arrived (fx_rate); value_base = value * fx_rate is what revenue
// adds up. Rates come from the ECB's daily reference rates (per euro).

/** The currencies the ECB publishes, plus the euro: the ones we can convert. */
export const REPORTING_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "NZD",
  "CHF",
  "JPY",
  "CNY",
  "HKD",
  "SGD",
  "INR",
  "IDR",
  "KRW",
  "MYR",
  "PHP",
  "THB",
  "BRL",
  "MXN",
  "ZAR",
  "TRY",
  "ILS",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "BGN",
  "ISK",
] as const;

/** The workspace's reporting currency, inside a SQL statement. */
export const reportingCurrencySql = (workspaceId: string) =>
  sql`coalesce((select currency from tracking_settings where workspace_id = ${workspaceId}), 'USD')`;

export async function getReportingCurrency(workspaceId: string) {
  const [row] = await getDb().execute<{ currency: string }>(
    sql`select ${reportingCurrencySql(workspaceId)} as currency`,
  );
  return row?.currency ?? "USD";
}

/**
 * Changes the reporting currency: every conversion is converted again (at
 * the rate of its own day) and emails' revenue is added up anew.
 */
export async function setReportingCurrency(workspaceId: string, currency: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(trackingSettings)
      .values({ workspaceId, currency })
      .onConflictDoUpdate({ target: trackingSettings.workspaceId, set: { currency } });
    await tx.execute(sql`
      update conversions set fx_rate = sc_fx_rate(currency, ${currency}, created_at)
      where workspace_id = ${workspaceId}`);
    await tx.execute(sql`
      update messages m set revenue = coalesce((
        select sum(value_base) from conversions v where v.message_id = m.id and v.status = 'approved'
      ), 0)
      where m.workspace_id = ${workspaceId}
        and (m.revenue <> 0 or exists (select 1 from conversions v where v.message_id = m.id))`);
  });
}

/** Rates per euro for a day: stored, then conversions still waiting for a rate get one. */
export async function storeFxRates(day: string, rates: Record<string, number>) {
  const entries = Object.entries(rates).filter(
    ([currency, rate]) => /^[A-Z]{3}$/.test(currency) && Number.isFinite(rate) && rate > 0,
  );
  if (entries.length === 0) return { stored: 0, converted: 0 };
  const db = getDb();
  for (const [currency, rate] of entries) {
    await db.execute(sql`
      insert into fx_rates (currency, day, per_eur) values (${currency}, ${day}::date, ${rate})
      on conflict (currency, day) do update set per_eur = excluded.per_eur`);
  }
  const updated = await db.execute<{ message_id: string | null }>(sql`
    update conversions v
    set fx_rate = sc_fx_rate(v.currency, coalesce(t.currency, 'USD'), v.created_at)
    from workspaces w left join tracking_settings t on t.workspace_id = w.id
    where w.id = v.workspace_id and v.fx_rate is null
      and sc_fx_rate(v.currency, coalesce(t.currency, 'USD'), v.created_at) is not null
    returning v.message_id`);
  const messages = [...new Set(updated.map((u) => u.message_id).filter(Boolean))] as string[];
  for (const messageId of messages) {
    await db.execute(sql`
      update messages set revenue = coalesce((
        select sum(value_base) from conversions where message_id = ${messageId} and status = 'approved'
      ), 0) where id = ${messageId}`);
  }
  return { stored: entries.length, converted: updated.length };
}

/** Conversions whose currency has no rate yet, so revenue leaves them out for now. */
export async function countUnconvertedConversions(workspaceId: string) {
  const [row] = await getDb().execute<{ n: number }>(sql`
    select count(*)::int as n from conversions where workspace_id = ${workspaceId} and fx_rate is null`);
  return row?.n ?? 0;
}
