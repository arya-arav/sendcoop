import {
  automationProblem,
  featureProblem,
  getAutomation,
  getCampaign,
  limitProblem,
  listCampaignLinks,
  queuedMessageBatches,
  segmentRulesProblem,
  setAutomationStatus,
  storeCampaignLinks,
} from "@sendcoop/db";
import { extractLinks } from "@sendcoop/mailer";
import { enqueueSendBatches } from "@sendcoop/queue";
import { segmentContext } from "@/lib/segment-context";

// Going live and pausing (D63). Not a "use server" file: it trusts the
// workspace id it's given.

export async function activateAutomation(workspaceId: string, automationId: string) {
  const automation = await getAutomation(workspaceId, automationId);
  if (!automation) return { ok: false as const, error: "This automation doesn't exist anymore." };
  const problem = automationProblem(automation.trigger, automation.graph, { activating: true });
  if (problem) return { ok: false as const, error: problem };
  const blocked =
    (await featureProblem(workspaceId, "automations")) ??
    (automation.status === "active" ? null : await limitProblem(workspaceId, "automations"));
  if (blocked) return { ok: false as const, error: blocked };

  // Field conditions are checked like segments: fields, operators and values.
  const context = await segmentContext(workspaceId);
  for (const node of automation.graph.nodes) {
    if (node.type !== "condition" || node.data.kind !== "rules") continue;
    const issue = segmentRulesProblem(node.data.rules, context);
    if (issue) return { ok: false as const, error: `A condition: ${issue}` };
  }

  const emails = automation.graph.nodes.flatMap((n) => (n.type === "email" ? [n] : []));
  for (const node of emails) {
    const campaign = await getCampaign(workspaceId, node.data.campaignId!);
    if (!campaign) return { ok: false as const, error: `“${node.data.name}” has no content.` };
    if (!campaign.sendingServerId || !campaign.sendingDomainId) {
      return {
        ok: false as const,
        error: `“${node.data.name}” needs a sending domain and server (add them in Settings).`,
      };
    }
    // Its links, recorded once, as a campaign's are when it starts.
    if ((await listCampaignLinks(workspaceId, campaign.id)).length === 0) {
      await storeCampaignLinks(
        workspaceId,
        campaign.id,
        "a",
        extractLinks(campaign.html, campaign.text),
      );
    }
  }
  await setAutomationStatus(workspaceId, automationId, "active");
  // Emails queued before a pause go out now.
  for (const node of emails) {
    const batches = await queuedMessageBatches(node.data.campaignId!);
    await enqueueSendBatches(
      batches.map((messageIds) => ({ campaignId: node.data.campaignId!, workspaceId, messageIds })),
      { round: `resume-${Date.now()}` },
    );
  }
  return { ok: true as const };
}

export async function pauseAutomation(workspaceId: string, automationId: string) {
  await setAutomationStatus(workspaceId, automationId, "paused");
  return { ok: true as const };
}
