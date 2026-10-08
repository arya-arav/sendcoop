import {
  finishUtmcapEvent,
  getUtmcapConnection,
  getUtmcapEvent,
  parseUtmcapStatus,
  recordUtmcapConversion,
  rememberUtmcapClick,
  sendcoopClickForUtmcap,
} from "@sendcoop/db";
import type { UtmcapEventJob } from "@sendcoop/queue";
import { findScCid, UtmcapClient, type UtmcapWebhookPayload } from "@sendcoop/utmcap";

/**
 * Applies a UTMCAP conversion webhook (D59): its status, payout and currency
 * win over what a postback said. The webhook names only UTMCAP's click id;
 * when no postback has told us which of our clicks that is, UTMCAP's click
 * log does (its external id is our sc_cid).
 */
export async function applyUtmcapEvent(
  job: UtmcapEventJob,
  { fetchImpl }: { fetchImpl?: typeof fetch } = {},
) {
  const event = await getUtmcapEvent(job.workspaceId, job.eventId);
  if (!event || event.processed_at) return { result: "skipped" as const };
  const { data } = event.payload as unknown as UtmcapWebhookPayload;
  if (!data?.click_id) {
    await finishUtmcapEvent(job.workspaceId, job.eventId, "no click_id in the event");
    return { result: "skipped" as const };
  }
  try {
    const connection = await getUtmcapConnection(job.workspaceId);
    // One UTMCAP account can feed several workspaces' webhooks: each takes
    // only conversions on clicks from its own Sendcoop traffic source.
    if (connection && data.source_id && data.source_id !== connection.sourceId) {
      await finishUtmcapEvent(job.workspaceId, job.eventId, null);
      return { result: "skipped" as const };
    }
    let clickId = await sendcoopClickForUtmcap(job.workspaceId, data.click_id);
    if (!clickId) {
      if (connection) {
        const client = new UtmcapClient({ apiKey: connection.apiKey, fetch: fetchImpl });
        clickId = findScCid(await client.getClick(data.click_id));
        if (clickId) await rememberUtmcapClick(job.workspaceId, data.click_id, clickId);
      }
    }
    const currency = String(data.currency ?? "USD").toUpperCase();
    const outcome = await recordUtmcapConversion(job.workspaceId, {
      ucid: data.click_id,
      clickId,
      conversionId: data.conversion_id ? String(data.conversion_id).slice(0, 150) : null,
      value: Math.abs(Number(data.payout) || 0),
      currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
      status: parseUtmcapStatus(data.status),
      occurredAt: data.recorded_at ? new Date(`${data.recorded_at.replace(" ", "T")}Z`) : undefined,
      via: "webhook",
      payload: { event: job.eventId, ...data },
    });
    await finishUtmcapEvent(job.workspaceId, job.eventId, null);
    return outcome;
  } catch (error) {
    await finishUtmcapEvent(
      job.workspaceId,
      job.eventId,
      error instanceof Error ? error.message.slice(0, 500) : "failed",
    );
    throw error;
  }
}
