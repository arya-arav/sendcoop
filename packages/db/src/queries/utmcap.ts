import { sql } from "drizzle-orm";
import { getDb } from "../client";
import type { ConversionStatus } from "../schema";
import { refreshMessageRevenue } from "./attribution";
import { recordConversion } from "./conversions";
import { reportingCurrencySql } from "./currency";

// Conversions UTMCAP reports on Sendcoop's email clicks (D58, D59). They
// arrive two ways:
//   - the Sendcoop traffic source's postback (approved ones, right away):
//     our sc_cid, usually UTMCAP's click id (ucid), the payout;
//   - conversion.created / .updated webhooks (every status change): ucid,
//     UTMCAP's conversion id, status, payout and currency, but not sc_cid.
// The webhook is the authority. One UTMCAP conversion is one Sendcoop
// conversion, keyed utmcap:<ucid>:<conversion id>; before the webhook names
// it, utmcap:<ucid> (or utmcap:sc:<sc_cid> without a ucid).

/** UTMCAP's own mapping (docs: measurement/postbacks): no status is approved; an unknown word, pending. */
export function parseUtmcapStatus(raw: string | null | undefined): ConversionStatus {
  const status = raw?.trim().toLowerCase();
  if (!status) return "approved";
  if (/^(approved?|sale|lead|conversion|confirmed|ok|1)$/.test(status)) return "approved";
  if (/^(rejected|reject|declined|cancell?ed|trash|0)$/.test(status)) return "rejected";
  if (/^(chargeback|refund|reversal|reversed)$/.test(status)) return "reversed";
  return "pending";
}

export type UtmcapConversionInput = {
  /** UTMCAP's click id. */
  ucid: string | null;
  /** Our click id, when known (the postback carries it). */
  clickId: string | null;
  /** UTMCAP's conversion id (webhooks only). */
  conversionId: string | null;
  value: number;
  currency: string;
  status: ConversionStatus;
  occurredAt?: Date;
  /** "postback" or "webhook": a postback never overrides what a webhook said. */
  via: "postback" | "webhook";
  payload: Record<string, unknown>;
};

export async function rememberUtmcapClick(workspaceId: string, ucid: string, clickId: string) {
  await getDb().execute(sql`
    insert into utmcap_clicks (workspace_id, ucid, click_id) values (${workspaceId}, ${ucid}, ${clickId})
    on conflict do nothing`);
}

/** Our click id for UTMCAP's, if a postback or lookup told us. */
export async function sendcoopClickForUtmcap(workspaceId: string, ucid: string) {
  const [row] = await getDb().execute<{ click_id: string }>(sql`
    select click_id from utmcap_clicks where workspace_id = ${workspaceId} and ucid = ${ucid}`);
  return row?.click_id ?? null;
}

export async function recordUtmcapConversion(
  workspaceId: string,
  input: UtmcapConversionInput,
): Promise<{ result: "created" | "updated" | "duplicate"; id: string | null }> {
  const db = getDb();
  const { ucid, conversionId } = input;
  if (ucid && input.clickId) await rememberUtmcapClick(workspaceId, ucid, input.clickId);
  const clickId = input.clickId ?? (ucid ? await sendcoopClickForUtmcap(workspaceId, ucid) : null);
  const exact = ucid && conversionId ? `utmcap:${ucid}:${conversionId}` : null;
  const unclaimed = ucid ? `utmcap:${ucid}` : clickId ? `utmcap:sc:${clickId}` : null;

  // The conversion as already recorded: exactly this one, or the one a
  // postback recorded before the webhook named it.
  const [existing] = await db.execute<{
    id: string;
    external_txid: string;
    message_id: string | null;
    status: ConversionStatus;
    value: number;
    currency: string;
  }>(sql`
    select id, external_txid, message_id, status, value::float8 as value, currency
    from conversions
    where workspace_id = ${workspaceId} and source = 'utmcap'
      and (external_txid = ${exact} or external_txid = ${unclaimed}
           or external_txid = ${clickId ? `utmcap:sc:${clickId}` : null}
           or (${input.via === "postback"} and ${ucid}::text is not null
               and external_txid like ${`utmcap:${ucid ?? ""}:%`}))
    order by (external_txid = ${exact}) desc nulls last, created_at
    limit 1`);

  if (existing) {
    // A postback after the webhook: the webhook already said it all.
    if (
      input.via === "postback" &&
      existing.external_txid.split(":").length > 2 &&
      !existing.external_txid.startsWith("utmcap:sc:")
    ) {
      return { result: "duplicate", id: null };
    }
    const claim = exact && existing.external_txid !== exact ? exact : existing.external_txid;
    const changed =
      claim !== existing.external_txid ||
      existing.status !== input.status ||
      Math.abs(existing.value - input.value) > 0.004 ||
      existing.currency !== input.currency;
    if (!changed) return { result: "duplicate", id: null };
    await db.execute(sql`
      update conversions set external_txid = ${claim}, status = ${input.status}::conversion_status,
        value = ${input.value}, currency = ${input.currency},
        fx_rate = sc_fx_rate(${input.currency}, ${reportingCurrencySql(workspaceId)}, created_at),
        payload = coalesce(payload, '{}'::jsonb) || ${JSON.stringify({ [input.via]: input.payload })}::jsonb,
        updated_at = now()
      where id = ${existing.id}`);
    if (existing.message_id) await refreshMessageRevenue(existing.message_id);
    return { result: "updated", id: existing.id };
  }

  const created = await recordConversion(workspaceId, {
    source: "utmcap",
    clickId,
    value: input.value,
    currency: input.currency,
    status: input.status,
    event: "sale",
    txid: exact ?? unclaimed,
    network: "utmcap",
    occurredAt: input.occurredAt,
    payload: { [input.via]: input.payload },
  });
  return { result: created.result, id: created.id };
}
