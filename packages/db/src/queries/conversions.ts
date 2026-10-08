import { sql } from "drizzle-orm";
import { getDb } from "../client";
import type { ConversionStatus } from "../schema";
import type { PostbackEvent } from "../postback-params";

export type ConversionInput = {
  source: "postback" | "pixel" | "shopify" | "woocommerce" | "lead" | "utmcap" | "api";
  clickId: string | null;
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
};

/**
 * Records a reported conversion, attributed to the email click it came with
 * (its message, campaign and subscriber). The reporter's transaction id makes
 * repeats harmless: the same one again is a duplicate, unless its status
 * changed (approved -> reversed). Without a transaction id, the click id and
 * value stand in, so a postback fired twice still counts once.
 */
export async function recordConversion(
  workspaceId: string,
  input: ConversionInput,
): Promise<ConversionResult> {
  const txid =
    input.txid?.slice(0, 200) ?? (input.clickId ? `auto:${input.clickId}:${input.value}` : null);
  const db = getDb();

  const [created] = await db.execute<{ id: string }>(sql`
    insert into conversions (workspace_id, click_id, click_row_id, message_id, campaign_id, subscriber_id,
                             source, event, value, currency, status, external_txid, network_id, payload)
    select ${workspaceId}, ${input.clickId}, c.id, c.message_id, c.campaign_id, c.subscriber_id,
           ${input.source}::conversion_source, ${input.event}::conversion_event, ${input.value},
           ${input.currency}, ${input.status}::conversion_status, ${txid}, ${input.network},
           ${JSON.stringify(input.payload)}::jsonb
    from (select 1) one
    left join lateral (
      select id, message_id, campaign_id, subscriber_id from clicks
      where workspace_id = ${workspaceId} and click_id = ${input.clickId}
      limit 1
    ) c on true
    on conflict (workspace_id, external_txid) where external_txid is not null do nothing
    returning id`);
  if (created) return { result: "created", id: created.id };

  // Seen before: only a status change is news.
  const [updated] = await db.execute<{ id: string }>(sql`
    update conversions set status = ${input.status}::conversion_status, updated_at = now()
    where workspace_id = ${workspaceId} and external_txid = ${txid}
      and status <> ${input.status}::conversion_status
    returning id`);
  if (updated) return { result: "updated", id: updated.id };
  return { result: "duplicate", id: null };
}
