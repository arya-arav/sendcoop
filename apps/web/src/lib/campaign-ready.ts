import { type Campaign, countAudience, listSendingDomains, listSendingServers } from "@sendcoop/db";

// What a draft still needs before it can be sent or scheduled. Shown as a
// checklist on the Schedule step, and checked again when sending.

export type ReadinessItem = { id: string; label: string; ok: boolean; fix: string; step: string };

export async function campaignReadiness(workspaceId: string, campaign: Campaign) {
  const [recipients, domains, servers] = await Promise.all([
    countAudience(workspaceId, campaign.audience),
    listSendingDomains(workspaceId),
    listSendingServers(workspaceId),
  ]);
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
  ];
  return { items, ready: items.every((i) => i.ok), recipients };
}
