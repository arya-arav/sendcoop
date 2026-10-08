import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { webhookDeliveries, webhookEndpoints } from "../schema";
import type { WebhookEvent } from "../webhook-events";

// Outgoing webhooks (D78). Triggers queue deliveries (migration 0045); the
// worker claims due ones, sends them and records how it went here.

/** Waits before each retry; after the last, a delivery has failed. */
export const WEBHOOK_RETRY_MINUTES = [1, 5, 30, 120, 360] as const;
/** Failed deliveries in a row after which an endpoint turns itself off. */
export const WEBHOOK_DISABLE_AFTER = 20;

export async function listWebhookEndpoints(workspaceId: string) {
  return getDb()
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.workspaceId, workspaceId))
    .orderBy(desc(webhookEndpoints.createdAt));
}

export async function createWebhookEndpoint(
  workspaceId: string,
  input: { url: string; description: string; events: WebhookEvent[] },
) {
  const [row] = await getDb()
    .insert(webhookEndpoints)
    .values({ workspaceId, ...input })
    .returning();
  return row!;
}

export async function deleteWebhookEndpoint(workspaceId: string, endpointId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(endpointId)) return false;
  const rows = await getDb()
    .delete(webhookEndpoints)
    .where(and(eq(webhookEndpoints.workspaceId, workspaceId), eq(webhookEndpoints.id, endpointId)))
    .returning({ id: webhookEndpoints.id });
  return rows.length > 0;
}

/** Turns an endpoint back on (after fixing it), or off. */
export async function setWebhookEndpointEnabled(
  workspaceId: string,
  endpointId: string,
  enabled: boolean,
) {
  if (!/^[0-9a-f-]{36}$/i.test(endpointId)) return false;
  const rows = await getDb()
    .update(webhookEndpoints)
    .set({ enabled, failureStreak: 0, disabledReason: null })
    .where(and(eq(webhookEndpoints.workspaceId, workspaceId), eq(webhookEndpoints.id, endpointId)))
    .returning({ id: webhookEndpoints.id });
  return rows.length > 0;
}

/** The latest deliveries to a workspace's endpoints, for the settings page. */
export async function recentWebhookDeliveries(workspaceId: string, limit = 30) {
  return getDb()
    .select({
      id: webhookDeliveries.id,
      endpointId: webhookDeliveries.endpointId,
      event: webhookDeliveries.event,
      status: webhookDeliveries.status,
      attempts: webhookDeliveries.attempts,
      responseStatus: webhookDeliveries.responseStatus,
      error: webhookDeliveries.error,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.workspaceId, workspaceId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

/** Queues a "webhook.test" delivery to one endpoint. */
export async function queueTestWebhook(workspaceId: string, endpointId: string) {
  const [endpoint] = await getDb()
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.workspaceId, workspaceId), eq(webhookEndpoints.id, endpointId)));
  if (!endpoint) return false;
  await getDb()
    .insert(webhookDeliveries)
    .values({
      endpointId,
      workspaceId,
      event: "webhook.test",
      payload: {
        event: "webhook.test",
        created_at: new Date().toISOString(),
        data: { message: "A test from Sendcoop: this endpoint is set up." },
      },
    });
  return true;
}

export type DueDelivery = {
  id: string;
  workspace_id: string;
  url: string;
  payload: Record<string, unknown>;
  attempts: number;
};

/**
 * Claims up to `limit` due deliveries (pushing them a minute ahead, so a
 * crashed worker's claims come back) for enabled endpoints.
 */
export async function claimDueWebhookDeliveries(limit = 50) {
  return getDb().execute<DueDelivery>(sql`
    with due as (
      select d.id from webhook_deliveries d
      join webhook_endpoints e on e.id = d.endpoint_id and e.enabled
      where d.status = 'pending' and d.next_attempt_at <= now()
      order by d.next_attempt_at
      limit ${limit}
      for update of d skip locked
    )
    update webhook_deliveries d set next_attempt_at = now() + interval '1 minute'
    from due, webhook_endpoints e
    where d.id = due.id and e.id = d.endpoint_id
    returning d.id, d.workspace_id, e.url, d.payload, d.attempts`);
}

/** Records one attempt: delivered, retried later, or failed for good. */
export async function recordWebhookDelivery(
  deliveryId: string,
  outcome: { ok: boolean; status: number | null; error: string | null },
) {
  const db = getDb();
  const [row] = await db.execute<{ attempts: number; endpoint_id: string }>(sql`
    update webhook_deliveries set attempts = attempts + 1 where id = ${deliveryId}
    returning attempts, endpoint_id`);
  if (!row) return;
  if (outcome.ok) {
    await db.execute(sql`
      update webhook_deliveries
      set status = 'delivered', delivered_at = now(), response_status = ${outcome.status}, error = null
      where id = ${deliveryId}`);
    await db.execute(
      sql`update webhook_endpoints set failure_streak = 0 where id = ${row.endpoint_id}`,
    );
    return;
  }
  const wait = WEBHOOK_RETRY_MINUTES[row.attempts - 1];
  await db.execute(sql`
    update webhook_deliveries
    set status = ${wait === undefined ? "failed" : "pending"}::webhook_delivery_status,
        next_attempt_at = now() + make_interval(mins => ${wait ?? 0}::int),
        response_status = ${outcome.status}, error = ${outcome.error}
    where id = ${deliveryId}`);
  if (wait === undefined) {
    await db.execute(sql`
      update webhook_endpoints
      set failure_streak = failure_streak + 1,
          enabled = failure_streak + 1 < ${WEBHOOK_DISABLE_AFTER},
          disabled_reason = case when failure_streak + 1 >= ${WEBHOOK_DISABLE_AFTER}
            then ${`Turned off after ${WEBHOOK_DISABLE_AFTER} failed deliveries in a row.`}
            else disabled_reason end
      where id = ${row.endpoint_id}`);
  }
}
