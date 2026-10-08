import { and, eq, inArray, sql } from "drizzle-orm";
import type { AutomationTrigger } from "../automations";
import { getDb } from "../client";
import { automations } from "../schema";
import { startAutomationRun } from "./automation-engine";

// What starts automation runs (D64, D65). Events land in automation_events
// (from database triggers and the API); processAutomationEvents starts the
// matching live automations. Date triggers are a scan, run every hour.

type Event = {
  id: string;
  workspace_id: string;
  type: string;
  subscriber_id: string;
  ref: string | null;
  external_id: string | null;
  payload: Record<string, unknown>;
};

/** Whether an automation's trigger is this event. */
export function triggerMatches(
  trigger: AutomationTrigger,
  event: Pick<Event, "type" | "ref" | "payload">,
) {
  if (trigger.type !== event.type) return false;
  switch (trigger.type) {
    case "joined_list":
      return trigger.listId === event.ref;
    case "tag_added":
      return trigger.tagId === event.ref;
    case "api_event":
      return trigger.event === event.ref;
    case "converted":
      return trigger.minValue === null || Number(event.payload.value ?? 0) >= trigger.minValue;
    case "lead_status":
      return trigger.stage === event.payload.stage;
    case "clicked_no_conversion":
      return trigger.campaignId === null || trigger.campaignId === event.payload.campaignId;
    default:
      return false;
  }
}

/**
 * Takes up to `limit` new events and starts the automations they trigger.
 * Returns the runs started, for the worker to move along.
 */
export async function processAutomationEvents(limit = 500) {
  const db = getDb();
  // Claimed in one statement, so two workers never take the same events.
  const events = await db.execute<Event>(sql`
    update automation_events set processed_at = now()
    where id in (
      select id from automation_events where processed_at is null
      order by created_at limit ${limit} for update skip locked)
    returning id, workspace_id, type, subscriber_id, ref, external_id, payload`);
  if (events.length === 0) return [];
  const workspaceIds = [...new Set(events.map((e) => e.workspace_id))];
  const live = await db
    .select({
      id: automations.id,
      workspace_id: automations.workspaceId,
      trigger: automations.trigger,
    })
    .from(automations)
    .where(and(eq(automations.status, "active"), inArray(automations.workspaceId, workspaceIds)));
  const started: string[] = [];
  for (const event of events) {
    // A purchase ends the sales sequences they're in (started before it).
    if (event.type === "converted") {
      await db.execute(sql`
        update automation_runs r set status = 'exited', exit_reason = 'converted',
          finished_at = now(), wait_until = null, updated_at = now()
        from automations a
        where a.id = r.automation_id and a.exit_on_conversion
          and r.workspace_id = ${event.workspace_id} and r.subscriber_id = ${event.subscriber_id}
          and r.status in ('active', 'waiting')
          and coalesce(r.context->>'conversionId', '') <> ${String(event.payload.conversionId ?? "")}`);
    }
    for (const automation of live) {
      if (automation.workspace_id !== event.workspace_id) continue;
      if (!triggerMatches(automation.trigger, event)) continue;
      const runId = await startAutomationRun(
        event.workspace_id,
        automation.id,
        event.subscriber_id,
        {
          // An API event with an id, or a conversion: once. A list or tag: again after the run ends.
          triggerRef: event.external_id ? `${event.type}:${event.external_id}` : null,
          context: { trigger: event.type, ...event.payload },
        },
      );
      if (runId) started.push(runId);
    }
  }
  return started;
}

/** Events processed more than a week ago go (they're for starting runs, not history). */
export async function pruneAutomationEvents() {
  await getDb().execute(sql`
    delete from automation_events where processed_at < now() - interval '7 days'`);
}

/**
 * An event from the API (D64): starts automations listening for it, for a
 * subscriber found by email or id. The same event id counts once.
 */
export async function recordApiEvent(
  workspaceId: string,
  input: {
    event: string;
    email: string | null;
    subscriberId: string | null;
    eventId: string | null;
    data: Record<string, unknown>;
  },
): Promise<"queued" | "duplicate" | "unknown_subscriber"> {
  const db = getDb();
  const [subscriber] = await db.execute<{ id: string }>(sql`
    select id from subscribers where workspace_id = ${workspaceId}
      and ${input.subscriberId ? sql`id = ${input.subscriberId}` : sql`email = ${input.email?.toLowerCase() ?? ""}`}`);
  if (!subscriber) return "unknown_subscriber";
  const inserted = await db.execute<{ id: string }>(sql`
    insert into automation_events (workspace_id, type, subscriber_id, ref, external_id, payload)
    values (${workspaceId}, 'api_event', ${subscriber.id}, ${input.event}, ${input.eventId},
            ${JSON.stringify(input.data)}::jsonb)
    on conflict (workspace_id, type, external_id) where external_id is not null do nothing
    returning id`);
  return inserted.length > 0 ? "queued" : "duplicate";
}

/**
 * Date triggers: subscribers whose date field (YYYY-MM-DD) plus the offset
 * is today, in UTC. Run every hour; the date in the trigger ref makes it once.
 */
export async function startDateTriggeredRuns(now = new Date()) {
  const db = getDb();
  const dated = await db.execute<{
    id: string;
    workspace_id: string;
    trigger: AutomationTrigger;
  }>(sql`
    select id, workspace_id, trigger from automations
    where status = 'active' and trigger->>'type' = 'date_field'`);
  const started: string[] = [];
  const today = now.toISOString().slice(0, 10);
  for (const automation of dated) {
    const t = automation.trigger;
    if (t.type !== "date_field" || !t.field) continue;
    // Fires offsetDays after the date: the date we're looking for is today - offset.
    const target = new Date(Date.parse(`${today}T00:00:00Z`) - t.offsetDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const due = await db.execute<{ id: string }>(sql`
      select id from subscribers
      where workspace_id = ${automation.workspace_id} and status = 'subscribed'
        and ${
          t.yearly
            ? sql`substr(fields->>${t.field}, 6, 5) = ${target.slice(5)}`
            : sql`fields->>${t.field} = ${target}`
        }
      limit 10000`);
    for (const s of due) {
      const runId = await startAutomationRun(automation.workspace_id, automation.id, s.id, {
        triggerRef: `date:${today}`,
        context: { trigger: "date_field", field: t.field, date: target },
      });
      if (runId) started.push(runId);
    }
  }
  return started;
}

/**
 * "Clicked but didn't buy" (D65): emails clicked at least N hours ago (up
 * to a week back, to catch up after downtime) whose reader hasn't converted
 * since. Each clicked email starts a run once.
 */
export async function startClickedNoConversionRuns(now = new Date()) {
  const db = getDb();
  const waiting = await db.execute<{
    id: string;
    workspace_id: string;
    trigger: AutomationTrigger;
  }>(sql`
    select id, workspace_id, trigger from automations
    where status = 'active' and trigger->>'type' = 'clicked_no_conversion'`);
  const started: string[] = [];
  for (const automation of waiting) {
    const t = automation.trigger;
    if (t.type !== "clicked_no_conversion") continue;
    const cutoff = new Date(now.getTime() - t.hours * 3_600_000);
    const oldest = new Date(cutoff.getTime() - 7 * 86_400_000);
    const due = await db.execute<{
      message_id: string;
      subscriber_id: string;
      campaign_id: string;
    }>(sql`
      select m.id as message_id, m.subscriber_id, m.campaign_id
      from messages m join campaigns c on c.id = m.campaign_id
      where m.workspace_id = ${automation.workspace_id} and c.kind = 'broadcast'
        and m.subscriber_id is not null
        and m.clicked_at <= ${cutoff.toISOString()} and m.clicked_at > ${oldest.toISOString()}
        and ${t.campaignId ? sql`m.campaign_id = ${t.campaignId}` : sql`true`}
        and not exists (select 1 from conversions v where v.subscriber_id = m.subscriber_id
          and v.status = 'approved' and v.created_at >= m.clicked_at)
        and not exists (select 1 from automation_runs r where r.automation_id = ${automation.id}
          and r.trigger_ref = 'click:' || m.id::text)
      limit 5000`);
    for (const m of due) {
      const runId = await startAutomationRun(
        automation.workspace_id,
        automation.id,
        m.subscriber_id,
        {
          triggerRef: `click:${m.message_id}`,
          context: {
            trigger: "clicked_no_conversion",
            campaignId: m.campaign_id,
            messageId: m.message_id,
          },
        },
      );
      if (runId) started.push(runId);
    }
  }
  return started;
}
