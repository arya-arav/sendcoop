import { getCampaign } from "@sendcoop/db";
import { CalendarClock } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { UnscheduleButton } from "./unschedule-button";

/** The schedule in words, e.g. "Mon, 12 Oct 2026, 09:00 (Europe/Berlin)". */
function describeSchedule(campaign: NonNullable<Awaited<ReturnType<typeof getCampaign>>>): string {
  const tz = campaign.scheduleTimezone ?? "UTC";
  if (campaign.sendInSubscriberTimezone && campaign.scheduleLocal) {
    // Stored without a zone: its UTC reading is the wall-clock time.
    const local = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(campaign.scheduleLocal);
    return `${local}, in each subscriber's timezone (${tz.replaceAll("_", " ")} for anyone without one)`;
  }
  const at = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: tz,
  }).format(campaign.scheduledAt ?? new Date());
  return `${at} (${tz.replaceAll("_", " ")})`;
}

// A draft opens in the builder; anything else shows where it stands (the
// full report arrives with click tracking in D40).
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ slug: string; campaignId: string }>;
}) {
  const { slug, campaignId } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const campaign = await getCampaign(workspace.id, campaignId);
  if (!campaign) notFound();
  if (campaign.status === "draft") redirect(`/w/${slug}/campaigns/${campaign.id}/recipients`);

  if (campaign.status === "scheduled") {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-sm">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>
              Scheduled for <strong>{describeSchedule(campaign)}</strong>.
            </span>
          </p>
          {canManage(role) && <UnscheduleButton slug={slug} campaignId={campaign.id} />}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="grid gap-1 text-sm">
        <p>
          Sent to {campaign.sentCount.toLocaleString("en")} of{" "}
          {campaign.recipientCount.toLocaleString("en")} recipients.
        </p>
        {campaign.error && <p className="text-muted-foreground">{campaign.error}</p>}
      </CardContent>
    </Card>
  );
}
