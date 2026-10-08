"use server";

import {
  type AutomationGraph,
  type AutomationNode,
  type AutomationTrigger,
  createAutomationFrom,
  ensureAutomationEmail,
  listSendingDomains,
  listSendingServers,
  setAutomationEmailContent,
} from "@sendcoop/db";
import { htmlToText } from "@sendcoop/mailer";
import { redirect } from "next/navigation";
import { AiError, aiAvailable, draftEmail, draftFlow, suggestSubjects } from "@/lib/ai";
import { canManage } from "@/lib/permissions";
import { withinRateLimit } from "@/lib/rate-limit";
import { requireMemberWorkspace } from "@/lib/workspace";

// AI assist (D70). Each call costs money, so: managers only, and a cap per
// workspace and hour.

async function allowed(slug: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) return { error: "Only workspace owners and admins can use AI assist." };
  if (!aiAvailable())
    return { error: "AI assist isn't set up on this server (ANTHROPIC_API_KEY)." };
  if (!(await withinRateLimit(`ai:${workspace.id}`, 60, 3600))) {
    return { error: "That's a lot of AI drafts for one hour. Try again a little later." };
  }
  return { workspace };
}

async function run<T>(slug: string, work: (workspaceId: string) => Promise<T>) {
  const check = await allowed(slug);
  if ("error" in check) return { ok: false as const, error: check.error! };
  try {
    return { ok: true as const, result: await work(check.workspace.id) };
  } catch (error) {
    if (error instanceof AiError) return { ok: false as const, error: error.message };
    throw error;
  }
}

export async function suggestSubjectsAction(slug: string, content: string, goal: string) {
  return run(slug, () => suggestSubjects({ content, goal: goal.trim() || null }));
}

export async function draftEmailAction(slug: string, brief: string, format: "html" | "text") {
  if (brief.trim().length < 10) {
    return { ok: false as const, error: "Say a little more about what the email should say." };
  }
  return run(slug, () => draftEmail({ brief, format }));
}

/** A draft automation from a goal: Claude's plan, built as a flow with its emails written. */
export async function draftFlowAction(slug: string, goal: string) {
  if (goal.trim().length < 10) {
    return { ok: false as const, error: "Describe the goal in a sentence or two." };
  }
  const outcome = await run(slug, async (workspaceId) => {
    const plan = await draftFlow({ goal });
    const trigger: AutomationTrigger =
      plan.trigger === "converted"
        ? { type: "converted", minValue: null }
        : plan.trigger === "clicked_no_conversion"
          ? { type: "clicked_no_conversion", campaignId: null, hours: 48 }
          : plan.trigger === "lead_status_new"
            ? { type: "lead_status", stage: "new" }
            : plan.trigger === "api_event"
              ? { type: "api_event", event: "" }
              : { type: "joined_list", listId: "" };
    const nodes: AutomationNode[] = [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
    ];
    const emails: Record<string, { subject: string; body: string }> = {};
    for (const [i, step] of plan.steps.slice(0, 12).entries()) {
      const position = { x: 0, y: (i + 1) * 140 };
      if (step.type === "email") {
        const id = `email-${i + 1}`;
        nodes.push({
          id,
          type: "email",
          position,
          data: {
            campaignId: null,
            name: step.name.slice(0, 80),
            subject: step.subject.slice(0, 200),
          },
        });
        emails[id] = { subject: step.subject, body: step.body };
      } else {
        nodes.push({
          id: `wait-${i + 1}`,
          type: "wait",
          position,
          data: { amount: Math.min(Math.max(Math.round(step.days), 1), 365), unit: "days" },
        });
      }
    }
    nodes.push({ id: "exit", type: "exit", position: { x: 0, y: nodes.length * 140 }, data: {} });
    const graph: AutomationGraph = {
      nodes,
      edges: nodes
        .slice(1)
        .map((n, i) => ({ id: `e-${nodes[i]!.id}-${n.id}`, source: nodes[i]!.id, target: n.id })),
    };
    const automation = await createAutomationFrom(workspaceId, {
      name: plan.name.slice(0, 100) || "AI draft",
      trigger,
      graph,
      exitOnConversion: plan.exitOnConversion,
    });
    const [domains, servers] = await Promise.all([
      listSendingDomains(workspaceId),
      listSendingServers(workspaceId),
    ]);
    const domain = domains.find((d) => d.status === "verified") ?? domains[0] ?? null;
    for (const [nodeId, email] of Object.entries(emails)) {
      const campaignId = await ensureAutomationEmail(workspaceId, automation.id, nodeId, {
        fromName: "Sendcoop",
        fromLocal: "hello",
        sendingDomainId: domain?.id ?? null,
        sendingServerId: servers[0]?.id ?? null,
      });
      if (!campaignId) continue;
      const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const html = `<html><body>${email.body
        .split(/\n{2,}/)
        .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
        .join("\n")}</body></html>`;
      await setAutomationEmailContent(workspaceId, campaignId, {
        subject: email.subject.slice(0, 200),
        html,
        text: htmlToText(html),
      });
    }
    return automation.id;
  });
  if (!outcome.ok) return outcome;
  redirect(`/w/${slug}/automations/${outcome.result}`);
}
