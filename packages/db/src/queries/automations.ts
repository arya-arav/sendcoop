import { and, eq, sql } from "drizzle-orm";
import {
  type AutomationGraph,
  type AutomationTrigger,
  automationProblem,
  starterGraph,
} from "../automations";
import { getDb } from "../client";
import { automations, campaigns } from "../schema";

// Automations as the builder sees them (D62). Runs and the engine are in
// automation-engine.ts (D63).

/** A new automation's trigger until one is chosen. */
const NO_TRIGGER: AutomationTrigger = { type: "joined_list", listId: "" };

export async function listAutomations(workspaceId: string) {
  return getDb().execute<{
    id: string;
    name: string;
    status: "draft" | "active" | "paused";
    trigger: AutomationTrigger;
    steps: number;
    live: number;
    finished: number;
    updated_at: string;
  }>(sql`
    select a.id, a.name, a.status, a.trigger,
           jsonb_array_length(a.graph->'nodes') - 1 as steps,
           (select count(*) from automation_runs r
              where r.automation_id = a.id and r.status in ('active', 'waiting'))::int as live,
           (select count(*) from automation_runs r
              where r.automation_id = a.id and r.status in ('completed', 'exited'))::int as finished,
           to_char(a.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
    from automations a where a.workspace_id = ${workspaceId}
    order by a.updated_at desc`);
}

export async function createAutomation(workspaceId: string, name: string) {
  const [row] = await getDb()
    .insert(automations)
    .values({ workspaceId, name, trigger: NO_TRIGGER, graph: starterGraph() })
    .returning();
  return row!;
}

export async function getAutomation(workspaceId: string, automationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(automationId)) return null;
  const [row] = await getDb()
    .select()
    .from(automations)
    .where(and(eq(automations.workspaceId, workspaceId), eq(automations.id, automationId)));
  return row ?? null;
}

export type SaveAutomationResult = { ok: true } | { ok: false; error: string };

/**
 * Saves the builder's work. A live automation must be paused first: runs
 * stand on its steps. Email steps keep the content already written for them.
 */
export async function saveAutomation(
  workspaceId: string,
  automationId: string,
  input: {
    name: string;
    trigger: AutomationTrigger;
    graph: AutomationGraph;
    exitOnConversion?: boolean;
  },
): Promise<SaveAutomationResult> {
  const current = await getAutomation(workspaceId, automationId);
  if (!current) return { ok: false, error: "This automation doesn't exist anymore." };
  if (current.status === "active") {
    return { ok: false, error: "Pause the automation before changing its steps." };
  }
  const problem = automationProblem(input.trigger, input.graph);
  if (problem) return { ok: false, error: problem };
  // An email step's content (campaign) is the server's to set, not the browser's.
  const known = new Map(
    current.graph.nodes
      .filter((n) => n.type === "email")
      .map((n) => [n.id, n.data.campaignId] as const),
  );
  const graph: AutomationGraph = {
    nodes: input.graph.nodes.map((n) =>
      n.type === "email" ? { ...n, data: { ...n.data, campaignId: known.get(n.id) ?? null } } : n,
    ),
    edges: input.graph.edges,
  };
  await getDb()
    .update(automations)
    .set({
      name: input.name.trim().slice(0, 100) || "Untitled automation",
      trigger: input.trigger,
      graph,
      ...(input.exitOnConversion === undefined ? {} : { exitOnConversion: input.exitOnConversion }),
      updatedAt: new Date(),
    })
    .where(and(eq(automations.workspaceId, workspaceId), eq(automations.id, automationId)));
  return { ok: true };
}

export async function deleteAutomation(workspaceId: string, automationId: string) {
  await getDb().transaction(async (tx) => {
    await tx
      .delete(campaigns)
      .where(and(eq(campaigns.workspaceId, workspaceId), eq(campaigns.automationId, automationId)));
    await tx
      .delete(automations)
      .where(and(eq(automations.workspaceId, workspaceId), eq(automations.id, automationId)));
  });
}

/**
 * The campaign holding an email step's content, made on first use (blank,
 * HTML) with the sender given. Returns its id.
 */
export async function ensureAutomationEmail(
  workspaceId: string,
  automationId: string,
  nodeId: string,
  sender: {
    fromName: string;
    fromLocal: string;
    sendingDomainId: string | null;
    sendingServerId: string | null;
  },
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [automation] = await tx
      .select()
      .from(automations)
      .where(and(eq(automations.workspaceId, workspaceId), eq(automations.id, automationId)))
      .for("update");
    if (!automation) return null;
    const node = automation.graph.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== "email") return null;
    if (node.data.campaignId) return node.data.campaignId;
    const [campaign] = await tx
      .insert(campaigns)
      .values({
        workspaceId,
        kind: "automation",
        automationId,
        name: `${automation.name}: ${node.data.name || "Email"}`.slice(0, 200),
        subject: node.data.subject || node.data.name || "",
        fromName: sender.fromName,
        fromLocal: sender.fromLocal,
        sendingDomainId: sender.sendingDomainId,
        sendingServerId: sender.sendingServerId,
        html: "<html><body><p>Hi {{first_name | there}},</p><p></p></body></html>",
        text: "Hi {{first_name | there}},",
      })
      .returning({ id: campaigns.id });
    const graph: AutomationGraph = {
      ...automation.graph,
      nodes: automation.graph.nodes.map((n) =>
        n.id === nodeId && n.type === "email"
          ? { ...n, data: { ...n.data, campaignId: campaign!.id } }
          : n,
      ),
    };
    await tx.update(automations).set({ graph }).where(eq(automations.id, automationId));
    return campaign!.id;
  });
}

/** The automation an email campaign belongs to, for the editor's way back. */
export async function automationOfCampaign(workspaceId: string, campaignId: string) {
  const [row] = await getDb()
    .select({ automationId: campaigns.automationId })
    .from(campaigns)
    .where(and(eq(campaigns.workspaceId, workspaceId), eq(campaigns.id, campaignId)));
  return row?.automationId ?? null;
}

/**
 * Goes live or pauses (D63). Live: its email campaigns send; paused: they
 * stop and can be edited (queued emails wait), and runs stand still.
 */
export async function setAutomationStatus(
  workspaceId: string,
  automationId: string,
  status: "active" | "paused",
) {
  await getDb().transaction(async (tx) => {
    await tx
      .update(automations)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(automations.workspaceId, workspaceId), eq(automations.id, automationId)));
    await tx
      .update(campaigns)
      .set(
        status === "active"
          ? { status: "sending", startedAt: sql`coalesce(${campaigns.startedAt}, now())` }
          : { status: "draft" },
      )
      .where(
        and(
          eq(campaigns.workspaceId, workspaceId),
          eq(campaigns.automationId, automationId),
          eq(campaigns.kind, "automation"),
        ),
      );
  });
}
