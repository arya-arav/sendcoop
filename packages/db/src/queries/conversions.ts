import { sql } from "drizzle-orm";
import { getDb } from "../client";
import type { PostbackEvent } from "../postback-params";
import type { ConversionStatus } from "../schema";
import { attributeConversion, refreshMessageRevenue } from "./attribution";

export type ConversionInput = {
  source: "postback" | "pixel" | "shopify" | "woocommerce" | "lead" | "utmcap" | "api";
  clickId: string | null;
  /** The buyer's email, for attribution when there's no click id. */
  email?: string | null;
  /** When it happened (defaults to now): attribution looks back from here. */
  occurredAt?: Date;
  value: number;
  currency: string;
  status: ConversionStatus;
  event: PostbackEvent;
  txid: string | null;
  network: string | null;
  payload: Record<string, unknown>;
};

export type ConversionResult = {
  /** created: new; updated: its status changed (e.g. refunded); duplicate: nothing new. */
  result: "created" | "updated" | "duplicate";
  id: string | null;
  method?: "click" | "email" | "subscriber" | "none";
};

/**
 * Records a reported conversion, credited to an email (see attribution).
 * The reporter's transaction id makes repeats harmless: the same one again
 * is a duplicate, unless its status changed (approved -> reversed). Without
 * a transaction id, the click id and value stand in. The credited message's
 * revenue is updated either way.
 */
export async function recordConversion(
  workspaceId: string,
  input: ConversionInput,
): Promise<ConversionResult> {
  const txid =
    input.txid?.slice(0, 200) ?? (input.clickId ? `auto:${input.clickId}:${input.value}` : null);
  const db = getDb();
  const credit = await attributeConversion(workspaceId, input);

  const [created] = await db.execute<{ id: string }>(sql`
    insert into conversions (workspace_id, click_id, click_row_id, message_id, campaign_id,
                             automation_id, subscriber_id, source, event, value, currency, status,
                             external_txid, network_id, payload, created_at)
    values (${workspaceId}, ${input.clickId}, ${credit.clickRowId}, ${credit.messageId},
            ${credit.campaignId}, ${credit.automationId}, ${credit.subscriberId},
            ${input.source}::conversion_source, ${input.event}::conversion_event, ${input.value},
            ${input.currency}, ${input.status}::conversion_status, ${txid}, ${input.network},
            ${JSON.stringify(input.payload)}::jsonb, ${(input.occurredAt ?? new Date()).toISOString()})
    on conflict (workspace_id, external_txid) where external_txid is not null do nothing
    returning id`);
  if (created) {
    if (credit.messageId) await refreshMessageRevenue(credit.messageId);
    return { result: "created", id: created.id, method: credit.method };
  }

  // Seen before: only a status change is news.
  const [updated] = await db.execute<{ id: string; message_id: string | null }>(sql`
    update conversions set status = ${input.status}::conversion_status, updated_at = now()
    where workspace_id = ${workspaceId} and external_txid = ${txid}
      and status <> ${input.status}::conversion_status
    returning id, message_id`);
  if (updated) {
    if (updated.message_id) await refreshMessageRevenue(updated.message_id);
    return { result: "updated", id: updated.id };
  }
  return { result: "duplicate", id: null };
}

export type RecentConversion = {
  id: string;
  /** Epoch ms. */
  at: number;
  source: ConversionInput["source"];
  network: string | null;
  value: number;
  currency: string;
  status: ConversionStatus;
  txid: string | null;
  campaignId: string | null;
  campaignName: string | null;
  /** Sent with the test button in settings. */
  test: boolean;
};

/** The latest conversions to arrive, newest first: for checking a setup works. */
export async function listRecentConversions(workspaceId: string, limit = 10) {
  return getDb().execute<RecentConversion>(sql`
    select v.id, (extract(epoch from v.created_at) * 1000)::float8 as at, v.source,
           v.network_id as network, v.value::float8 as value, v.currency, v.status,
           v.external_txid as txid, v.campaign_id as "campaignId", c.name as "campaignName",
           coalesce(v.payload->>'test' = '1', false) as test
    from conversions v
    left join campaigns c on c.id = v.campaign_id
    where v.workspace_id = ${workspaceId}
    order by v.id desc
    limit ${limit}`);
}
