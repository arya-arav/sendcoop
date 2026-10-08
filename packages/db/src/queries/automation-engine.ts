import { and, eq, sql } from "drizzle-orm";
import {
  type ActionStep,
  type AutomationNode,
  type ConditionStep,
  nextNodeId,
  waitMs,
} from "../automations";
import { getDb } from "../client";
import { automationRuns, automations, subscribers } from "../schema";
import type { SegmentRules } from "../segments";
import { getSegment } from "./segments";
import { subscriberConditions } from "./subscribers";

// The automation engine's database side (D63). A run is moved along one
// step at a time by the worker (advanceRun in the worker). Every step writes
// its log row first; a step that finds its log already there was done before
// (a retry, a crash), so nothing is sent or changed twice.

export type RunAdvance =
  | { state: "done"; status: "completed" | "exited" | "failed" }
  /** Waiting: wake it again at this time. */
  | { state: "waiting"; until: Date }
  /** Stopped for now (automation paused, already finished, not found). */
  | { state: "idle" }
  /** The step queued an email: the worker sends it, then carries on. */
  | { state: "email"; campaignId: string; messageId: string; workspaceId: string; next: true }
  /** A webhook action: the worker calls it (D67), then carries on. */
  | { state: "webhook"; url: string; body: Record<string, unknown>; next: true };

/**
 * Starts a run for a subscriber, unless one is live already or this trigger
 * started one before. The run begins at the step after the trigger.
 */
export async function startAutomationRun(
  workspaceId: string,
  automationId: string,
  subscriberId: string,
  {
    triggerRef = null,
    context = {},
  }: { triggerRef?: string | null; context?: Record<string, unknown> } = {},
) {
  const db = getDb();
  const [automation] = await db
    .select({ status: automations.status, graph: automations.graph })
    .from(automations)
    .where(and(eq(automations.workspaceId, workspaceId), eq(automations.id, automationId)));
  if (!automation || automation.status !== "active") return null;
  const first = nextNodeId(automation.graph, "trigger");
  const [run] = await db.execute<{ id: string }>(sql`
    insert into automation_runs (workspace_id, automation_id, subscriber_id, status, current_node_id,
                                 trigger_ref, context)
    select ${workspaceId}, ${automationId}, s.id, 'active', ${first}, ${triggerRef},
           ${JSON.stringify(context)}::jsonb
    from subscribers s
    where s.workspace_id = ${workspaceId} and s.id = ${subscriberId} and s.status = 'subscribed'
    on conflict do nothing
    returning id`);
  return run?.id ?? null;
}

async function finish(
  runId: string,
  status: "completed" | "exited" | "failed",
  reason: string | null,
) {
  await getDb().execute(sql`
    update automation_runs set status = ${status}::automation_run_status, finished_at = now(),
      exit_reason = ${reason}, current_node_id = null, wait_until = null, updated_at = now()
    where id = ${runId} and status in ('active', 'waiting')`);
  return { state: "done" as const, status };
}

/** Writes a step's log; false when it was written before (the step is done). */
async function logStep(
  run: { id: string; workspace_id: string; automation_id: string },
  node: AutomationNode,
  status: "done" | "skipped" | "failed",
  detail: Record<string, unknown>,
) {
  const inserted = await getDb().execute<{ id: string }>(sql`
    insert into automation_step_logs (workspace_id, automation_id, run_id, node_id, kind, status, detail)
    values (${run.workspace_id}, ${run.automation_id}, ${run.id}, ${node.id}, ${node.type},
            ${status}::automation_step_status, ${JSON.stringify(detail)}::jsonb)
    on conflict (run_id, node_id) do nothing
    returning id`);
  return inserted.length > 0;
}

async function stepLog(runId: string, nodeId: string) {
  const [row] = await getDb().execute<{ status: string; detail: Record<string, unknown> }>(sql`
    select status, detail from automation_step_logs where run_id = ${runId} and node_id = ${nodeId}`);
  return row ?? null;
}

async function moveTo(runId: string, nodeId: string | null) {
  await getDb().execute(sql`
    update automation_runs set current_node_id = ${nodeId}, status = 'active', wait_until = null,
      updated_at = now()
    where id = ${runId}`);
}

/**
 * Does the run's current step, and as many after it as can go right away.
 * Returns where it stopped: done, waiting, or an email/webhook for the
 * worker to send before calling again.
 */
export async function advanceAutomationRun(runId: string, now = new Date()): Promise<RunAdvance> {
  const db = getDb();
  for (let steps = 0; steps < 50; steps++) {
    const [run] = await db.execute<{
      id: string;
      workspace_id: string;
      automation_id: string;
      subscriber_id: string;
      status: string;
      current_node_id: string | null;
      wait_until: Date | null;
      started_at: Date;
      context: Record<string, unknown>;
      automation_status: string;
      graph: {
        nodes: AutomationNode[];
        edges: { source: string; target: string; sourceHandle?: string | null }[];
      };
      subscriber_status: string | null;
    }>(sql`
      select r.id, r.workspace_id, r.automation_id, r.subscriber_id, r.status, r.current_node_id,
             r.wait_until, r.started_at, r.context, a.status as automation_status, a.graph,
             s.status as subscriber_status
      from automation_runs r
      join automations a on a.id = r.automation_id
      left join subscribers s on s.id = r.subscriber_id
      where r.id = ${runId}`);
    if (!run || (run.status !== "active" && run.status !== "waiting")) return { state: "idle" };
    if (run.automation_status !== "active") return { state: "idle" };
    // Unsubscribed, bounced or deleted: nothing more for them.
    if (run.subscriber_status !== "subscribed") {
      return finish(run.id, "exited", run.subscriber_status ?? "deleted");
    }
    const graph = { nodes: run.graph.nodes, edges: run.graph.edges } as Parameters<
      typeof nextNodeId
    >[0];

    if (run.status === "waiting") {
      const until = new Date(run.wait_until ?? now);
      if (until > now) return { state: "waiting", until };
      await moveTo(run.id, run.current_node_id ? nextNodeId(graph, run.current_node_id) : null);
      continue;
    }

    const node = graph.nodes.find((n) => n.id === run.current_node_id);
    // The end of the path, or a step removed while the run stood on it.
    if (!node) return finish(run.id, "completed", null);

    switch (node.type) {
      case "trigger":
        await moveTo(run.id, nextNodeId(graph, node.id));
        continue;

      case "exit":
        await logStep(run, node, "done", {});
        return finish(run.id, "completed", null);

      case "email": {
        const fresh = await logStep(run, node, "done", { campaignId: node.data.campaignId });
        const next = nextNodeId(graph, node.id);
        if (!fresh || !node.data.campaignId) {
          await moveTo(run.id, next);
          continue;
        }
        const [message] = await db.execute<{ id: string }>(sql`
          insert into messages (workspace_id, campaign_id, subscriber_id, automation_run_id, email)
          select ${run.workspace_id}, ${node.data.campaignId}, s.id, ${run.id}, s.email
          from subscribers s where s.id = ${run.subscriber_id}
          on conflict do nothing
          returning id`);
        await moveTo(run.id, next);
        if (!message) continue;
        await db.execute(sql`
          update automation_step_logs set detail = detail || ${JSON.stringify({ messageId: message.id })}::jsonb
          where run_id = ${run.id} and node_id = ${node.id}`);
        return {
          state: "email",
          campaignId: node.data.campaignId,
          messageId: message.id,
          workspaceId: run.workspace_id,
          next: true,
        };
      }

      case "wait": {
        const fresh = await logStep(run, node, "done", {});
        const log = fresh ? null : await stepLog(run.id, node.id);
        const until = fresh
          ? new Date(now.getTime() + waitMs(node.data))
          : new Date(String(log?.detail.until ?? now.toISOString()));
        if (fresh) {
          await db.execute(sql`
            update automation_step_logs set detail = ${JSON.stringify({ until: until.toISOString() })}::jsonb
            where run_id = ${run.id} and node_id = ${node.id}`);
        }
        await db
          .update(automationRuns)
          .set({ status: "waiting", waitUntil: until, updatedAt: new Date() })
          .where(eq(automationRuns.id, run.id));
        if (until <= now) continue;
        return { state: "waiting", until };
      }

      case "condition": {
        const done = await stepLog(run.id, node.id);
        const yes = done
          ? done.detail.branch === "yes"
          : await conditionHolds(run, node.data, graph.nodes);
        if (!done) await logStep(run, node, "done", { branch: yes ? "yes" : "no" });
        await moveTo(run.id, nextNodeId(graph, node.id, yes ? "yes" : "no"));
        continue;
      }

      case "action": {
        const fresh = await logStep(run, node, "done", { type: node.data.type });
        await moveTo(run.id, nextNodeId(graph, node.id));
        if (!fresh) continue;
        if (node.data.type === "webhook") {
          return {
            state: "webhook",
            url: node.data.url,
            body: {
              runId: run.id,
              automationId: run.automation_id,
              subscriberId: run.subscriber_id,
            },
            next: true,
          };
        }
        await performAction(run.workspace_id, run.subscriber_id, node.data);
        continue;
      }
    }
  }
  return finish(runId, "failed", "Too many steps in a row.");
}

async function conditionHolds(
  run: { id: string; workspace_id: string; subscriber_id: string; started_at: Date },
  condition: ConditionStep,
  nodes: AutomationNode[],
): Promise<boolean> {
  const db = getDb();
  if (condition.kind === "activity") {
    if (condition.event === "converted") {
      const [row] = await db.execute<{ yes: boolean }>(sql`
        select exists (select 1 from conversions where subscriber_id = ${run.subscriber_id}
          and status = 'approved' and created_at >= ${new Date(run.started_at).toISOString()}) as yes`);
      return Boolean(row?.yes);
    }
    const target = nodes.find((n) => n.id === condition.nodeId);
    const campaignId = target?.type === "email" ? target.data.campaignId : null;
    const column = sql.raw(condition.event === "opened" ? "opened_at" : "clicked_at");
    const [row] = await db.execute<{ yes: boolean }>(sql`
      select exists (select 1 from messages where automation_run_id = ${run.id}
        and ${column} is not null
        ${campaignId ? sql`and campaign_id = ${campaignId}` : sql``}) as yes`);
    return Boolean(row?.yes);
  }
  let rules: SegmentRules;
  if (condition.kind === "segment") {
    const segment = await getSegment(run.workspace_id, condition.segmentId);
    if (!segment) return false;
    rules = segment.rules;
  } else {
    rules = condition.rules;
  }
  const [row] = await db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(
      and(
        subscriberConditions(run.workspace_id, { segment: rules }),
        eq(subscribers.id, run.subscriber_id),
      ),
    );
  return Boolean(row);
}

/** Tags, lists and fields (webhooks are the worker's: they leave the building). */
export async function performAction(workspaceId: string, subscriberId: string, action: ActionStep) {
  const db = getDb();
  switch (action.type) {
    case "add_tag":
      await db.execute(sql`
        insert into subscriber_tags (subscriber_id, tag_id)
        select ${subscriberId}, t.id from tags t where t.id = ${action.tagId} and t.workspace_id = ${workspaceId}
        on conflict do nothing`);
      return;
    case "remove_tag":
      await db.execute(sql`
        delete from subscriber_tags where subscriber_id = ${subscriberId} and tag_id = ${action.tagId}`);
      return;
    case "add_to_list":
      await db.execute(sql`
        insert into list_memberships (list_id, subscriber_id)
        select l.id, ${subscriberId} from lists l where l.id = ${action.listId} and l.workspace_id = ${workspaceId}
        on conflict do nothing`);
      return;
    case "remove_from_list":
      await db.execute(sql`
        delete from list_memberships where subscriber_id = ${subscriberId} and list_id = ${action.listId}`);
      return;
    case "move_list":
      await performAction(workspaceId, subscriberId, {
        type: "add_to_list",
        listId: action.toListId,
      });
      await performAction(workspaceId, subscriberId, {
        type: "remove_from_list",
        listId: action.fromListId,
      });
      return;
    case "update_field":
      await db.execute(sql`
        update subscribers set fields = coalesce(fields, '{}'::jsonb) || jsonb_build_object(${action.field}::text, ${action.value}::text),
          updated_at = now()
        where id = ${subscriberId} and workspace_id = ${workspaceId}`);
      return;
    case "webhook":
      return;
  }
}

/** Runs to move along: active ones, and waits that are over (the sweeper's list). */
export async function dueAutomationRuns(limit = 500, now = new Date()) {
  return getDb().execute<{ id: string }>(sql`
    select r.id from automation_runs r join automations a on a.id = r.automation_id
    where a.status = 'active'
      and (r.status = 'active' or (r.status = 'waiting' and r.wait_until <= ${now.toISOString()}))
    order by r.updated_at
    limit ${limit}`);
}

export async function getAutomationRun(runId: string) {
  const [row] = await getDb().select().from(automationRuns).where(eq(automationRuns.id, runId));
  return row ?? null;
}
