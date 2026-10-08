import { getCampaign } from "@sendcoop/db";
import { CircleAlert, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { campaignReadiness } from "@/lib/campaign-ready";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { ScheduleForm } from "./schedule-form";

export const metadata: Metadata = { title: "Send or schedule" };

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ slug: string; campaignId: string }>;
}) {
  const { slug, campaignId } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const campaign = await getCampaign(workspace.id, campaignId);
  if (!campaign) notFound();
  if (campaign.status !== "draft") redirect(`/w/${slug}/campaigns/${campaign.id}`);
  const { items, ready, recipients } = await campaignReadiness(workspace.id, campaign);
  const base = `/w/${slug}/campaigns/${campaign.id}`;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Before sending</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2" aria-label="Checklist">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                {item.ok ? (
                  <CircleCheck className="size-4 text-green-600" aria-label="Done" />
                ) : (
                  <CircleAlert className="size-4 text-destructive" aria-label="To do" />
                )}
                <span>{item.label}</span>
                {!item.ok && (
                  <Link
                    href={
                      item.step.startsWith("/") ? `/w/${slug}${item.step}` : `${base}/${item.step}`
                    }
                    className="text-muted-foreground underline"
                  >
                    {item.fix}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {canManage(role) && (
        <ScheduleForm
          slug={slug}
          campaignId={campaign.id}
          ready={ready}
          recipients={recipients}
          timezones={Intl.supportedValuesOf("timeZone")}
        />
      )}
    </div>
  );
}
