import { getCampaign } from "@sendcoop/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { requireMemberWorkspace } from "@/lib/workspace";
import { STATUS_LABELS } from "../../status";
import { CampaignSteps } from "./steps";

export default async function CampaignLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string; campaignId: string }>;
  children: React.ReactNode;
}) {
  const { slug, campaignId } = await params;
  const { workspace } = await requireMemberWorkspace(slug);
  if (!z.uuid().safeParse(campaignId).success) notFound();
  const campaign = await getCampaign(workspace.id, campaignId);
  if (!campaign) notFound();
  const status = STATUS_LABELS[campaign.status];

  return (
    <div className="grid gap-6">
      <Link
        href={`/w/${slug}/campaigns`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Campaigns
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold">{campaign.name}</h1>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      {campaign.status === "draft" && (
        <CampaignSteps base={`/w/${slug}/campaigns/${campaign.id}`} />
      )}
      {children}
    </div>
  );
}
