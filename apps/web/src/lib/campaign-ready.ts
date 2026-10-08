import {
  audienceQuality,
  type Campaign,
  countAudience,
  LIST_QUALITY,
  listSendingDomains,
  listSendingServers,
  sendQuotaProblem,
  workspaceQuota,
} from "@sendcoop/db";

// What a draft still needs before it can be sent or scheduled. Shown as a
// checklist on the Schedule step, and checked again when sending.

/** step: the builder step that fixes it, or a workspace path ("/settings/…"). */
export type ReadinessItem = { id: string; label: string; ok: boolean; fix: string; step: string };

export async function campaignReadiness(workspaceId: string, campaign: Campaign) {
  const [recipients, domains, servers, quota, quality] = await Promise.all([
    countAudience(workspaceId, campaign.audience),
    listSendingDomains(workspaceId),
    listSendingServers(workspaceId),
    workspaceQuota(workspaceId),
    audienceQuality(workspaceId, campaign.audience),
  ]);
  // Lists full of shared and throwaway addresses were bought or scraped (D76).
  const riskyShare =
    quality.total >= LIST_QUALITY.minRecipients
      ? (quality.role + quality.disposable) / quality.total
      : 0;
  const qualityProblem =
    riskyShare >= LIST_QUALITY.maxRiskyShare
      ? `${Math.round(riskyShare * 100)}% of recipients are shared or throwaway addresses (${quality.role.toLocaleString("en")} like info@ or sales@, ${quality.disposable.toLocaleString("en")} disposable). Lists like this are usually bought or scraped, and they complain and bounce. Remove them from the audience to send.`
      : null;
  const overSubscribers =
    !quota.suspended &&
    quota.limits.subscribers !== null &&
    quota.usage.subscribers > quota.limits.subscribers;
  const quotaProblem = overSubscribers
    ? `You have ${quota.usage.subscribers.toLocaleString("en")} subscribers, over your ${quota.planName} plan's ${quota.limits.subscribers!.toLocaleString("en")}. Upgrade your plan, or delete or unsubscribe some, to send again.`
    : sendQuotaProblem(quota, recipients);
  const items: ReadinessItem[] = [
    {
      id: "recipients",
      label: `${recipients.toLocaleString("en")} ${recipients === 1 ? "recipient" : "recipients"}`,
      ok: recipients > 0,
      fix: "Choose who gets it.",
      step: "recipients",
    },
    {
      id: "subject",
      label: "Subject",
      ok: campaign.subject.trim() !== "",
      fix: "Write a subject.",
      step: "content",
    },
    {
      id: "content",
      label: "Email content",
      ok: campaign.html.trim() !== "" || campaign.text.trim() !== "",
      fix: "Add the email.",
      step: "content",
    },
    {
      id: "sender",
      label: "Sending domain and server",
      ok:
        domains.some((d) => d.id === campaign.sendingDomainId) &&
        servers.some((s) => s.id === campaign.sendingServerId),
      fix: "Choose a sending domain and server.",
      step: "content",
    },
    {
      id: "quality",
      label: "List quality",
      ok: qualityProblem === null,
      fix: qualityProblem ?? "",
      step: "recipients",
    },
    {
      id: "quota",
      label: "Within your plan",
      ok: quotaProblem === null,
      fix: quotaProblem ?? "",
      step: "/settings/billing",
    },
  ];
  return { items, ready: items.every((i) => i.ok), recipients };
}
