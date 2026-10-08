import {
  getCampaign,
  getVariantB,
  listSendingDomains,
  listSendingServers,
  listTemplates,
} from "@sendcoop/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { canManage } from "@/lib/permissions";
import { STARTERS } from "@/lib/starters";
import { requireMemberWorkspace } from "@/lib/workspace";
import { AbTestCard } from "./ab-test-card";
import { ContentCard } from "./content-card";
import { EnvelopeForm } from "./envelope-form";
import { TestSendForm } from "./test-send-form";

export const metadata: Metadata = { title: "Campaign content" };

export default async function ContentPage({
  params,
}: {
  params: Promise<{ slug: string; campaignId: string }>;
}) {
  const { slug, campaignId } = await params;
  const { workspace, role, user } = await requireMemberWorkspace(slug);
  const campaign = await getCampaign(workspace.id, campaignId);
  if (!campaign) notFound();
  if (campaign.status !== "draft") redirect(`/w/${slug}/campaigns/${campaign.id}`);
  const editable = canManage(role);

  const [domains, servers, templates, variantB] = await Promise.all([
    listSendingDomains(workspace.id),
    listSendingServers(workspace.id),
    listTemplates(workspace.id),
    getVariantB(campaign.id),
  ]);

  return (
    <div className="grid gap-6">
      <EnvelopeForm
        slug={slug}
        campaignId={campaign.id}
        editable={editable}
        initial={{
          subject: campaign.subject,
          preheader: campaign.preheader,
          fromName: campaign.fromName,
          fromLocal: campaign.fromLocal,
          sendingDomainId: campaign.sendingDomainId,
          sendingServerId: campaign.sendingServerId,
          replyTo: campaign.replyTo ?? "",
        }}
        domains={domains.map((d) => ({
          id: d.id,
          label: d.domain,
          verified: d.status === "verified",
        }))}
        servers={servers.map((s) => ({ id: s.id, label: `${s.name} (${s.summary})` }))}
      />
      <ContentCard
        slug={slug}
        campaignId={campaign.id}
        editable={editable}
        editor={campaign.editor}
        html={campaign.html}
        text={campaign.text}
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        starters={STARTERS.map((s) => ({ id: s.id, name: `${s.name} (${s.category})` }))}
      />
      {editable && (
        <AbTestCard
          slug={slug}
          campaignId={campaign.id}
          initial={{
            enabled: campaign.abTest !== null,
            testPercent: campaign.abTest?.testPercent ?? 20,
            waitHours: Math.round((campaign.abTest?.waitMinutes ?? 240) / 60),
            metric: campaign.abTest?.metric ?? "clicks",
            subject: variantB?.subject ?? campaign.subject,
            preheader: variantB?.preheader ?? campaign.preheader,
            hasVariant: variantB !== null,
          }}
          templates={templates.map((t) => ({ id: t.id, name: t.name }))}
          starters={STARTERS.map((s) => ({ id: s.id, name: `${s.name} (${s.category})` }))}
        />
      )}
      {editable && <TestSendForm slug={slug} campaignId={campaign.id} defaultTo={user.email} />}
    </div>
  );
}
