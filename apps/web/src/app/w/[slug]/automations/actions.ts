"use server";

import {
  AUTOMATION_TEMPLATES,
  type AutomationGraph,
  type AutomationTrigger,
  createAutomation,
  createAutomationFrom,
  deleteAutomation,
  ensureAutomationEmail,
  listSendingDomains,
  listSendingServers,
  saveAutomation,
  setAutomationEmailContent,
  templateGraph,
} from "@sendcoop/db";
import { htmlToText } from "@sendcoop/mailer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { activateAutomation, pauseAutomation } from "@/lib/automation-control";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

const NOT_ALLOWED = "Only workspace owners and admins can change automations.";

export async function createAutomationAction(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { ok: false as const, error: NOT_ALLOWED };
  const automation = await createAutomation(workspace.id, "Untitled automation");
  redirect(`/w/${slug}/automations/${automation.id}`);
}

// Shapes only: automationProblem (in saveAutomation) checks the meaning.
const point = z.object({ x: z.number(), y: z.number() });
const node = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(["trigger", "email", "wait", "condition", "action", "exit"]),
  position: point,
  data: z.record(z.string(), z.unknown()),
});
const edge = z.object({
  id: z.string().min(1).max(200),
  source: z.string().max(64),
  target: z.string().max(64),
  sourceHandle: z.enum(["yes", "no"]).nullable().optional(),
});
const input = z.object({
  name: z.string().max(100),
  exitOnConversion: z.boolean().optional(),
  trigger: z.object({ type: z.string() }).passthrough(),
  graph: z.object({ nodes: z.array(node).max(100), edges: z.array(edge).max(300) }),
});

export async function saveAutomationAction(slug: string, automationId: string, raw: unknown) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { ok: false as const, error: NOT_ALLOWED };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "That automation couldn't be read." };
  const result = await saveAutomation(workspace.id, automationId, {
    name: parsed.data.name,
    trigger: parsed.data.trigger as AutomationTrigger,
    graph: parsed.data.graph as AutomationGraph,
    exitOnConversion: parsed.data.exitOnConversion,
  });
  if (result.ok) revalidatePath(`/w/${slug}/automations`);
  return result;
}

export async function deleteAutomationAction(slug: string, automationId: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { ok: false as const, error: NOT_ALLOWED };
  await deleteAutomation(workspace.id, automationId);
  redirect(`/w/${slug}/automations`);
}

/** Opens an email step's content in the editor, making it on first use. Save the flow first. */
export async function editAutomationEmailAction(
  slug: string,
  automationId: string,
  nodeId: string,
) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { ok: false as const, error: NOT_ALLOWED };
  const [domains, servers] = await Promise.all([
    listSendingDomains(workspace.id),
    listSendingServers(workspace.id),
  ]);
  const domain = domains.find((d) => d.status === "verified") ?? domains[0] ?? null;
  const campaignId = await ensureAutomationEmail(workspace.id, automationId, nodeId, {
    fromName: workspace.name,
    fromLocal: "hello",
    sendingDomainId: domain?.id ?? null,
    sendingServerId: servers[0]?.id ?? null,
  });
  if (!campaignId) {
    return { ok: false as const, error: "Save the automation first, then write this email." };
  }
  redirect(`/w/${slug}/campaigns/${campaignId}/design`);
}

export async function activateAutomationAction(slug: string, automationId: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { ok: false as const, error: NOT_ALLOWED };
  const result = await activateAutomation(workspace.id, automationId);
  revalidatePath(`/w/${slug}/automations`, "layout");
  return result;
}

export async function pauseAutomationAction(slug: string, automationId: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { ok: false as const, error: NOT_ALLOWED };
  const result = await pauseAutomation(workspace.id, automationId);
  revalidatePath(`/w/${slug}/automations`, "layout");
  return result;
}

/** Installs a ready-made flow as a draft, its emails written (D69). */
export async function installAutomationTemplateAction(slug: string, templateId: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { ok: false as const, error: NOT_ALLOWED };
  const template = AUTOMATION_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return { ok: false as const, error: "That flow doesn't exist." };
  const { graph, emails } = templateGraph(template);
  const automation = await createAutomationFrom(workspace.id, {
    name: template.name,
    trigger: template.trigger,
    graph,
    exitOnConversion: template.exitOnConversion,
  });
  const [domains, servers] = await Promise.all([
    listSendingDomains(workspace.id),
    listSendingServers(workspace.id),
  ]);
  const domain = domains.find((d) => d.status === "verified") ?? domains[0] ?? null;
  for (const [nodeId, email] of Object.entries(emails)) {
    const campaignId = await ensureAutomationEmail(workspace.id, automation.id, nodeId, {
      fromName: workspace.name,
      fromLocal: "hello",
      sendingDomainId: domain?.id ?? null,
      sendingServerId: servers[0]?.id ?? null,
    });
    if (campaignId) {
      await setAutomationEmailContent(workspace.id, campaignId, {
        subject: email.subject,
        html: email.html,
        text: htmlToText(email.html),
      });
    }
  }
  revalidatePath(`/w/${slug}/automations`);
  redirect(`/w/${slug}/automations/${automation.id}`);
}
