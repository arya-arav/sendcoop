import { abResults, getCampaign, getVariantB } from "@sendcoop/db";
import { CalendarClock } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  const ab = campaign.abTest ? await abResults(campaign.id) : null;
  const variantB = campaign.abTest ? await getVariantB(campaign.id) : null;
  const money = (n: number) => n.toLocaleString("en", { style: "currency", currency: "USD" });

  return (
    <div className="grid gap-6">
      <Card>
        <CardContent className="grid gap-1 text-sm">
          <p>
            Sent to {campaign.sentCount.toLocaleString("en")} of{" "}
            {campaign.recipientCount.toLocaleString("en")} recipients.
          </p>
          {campaign.error && <p className="text-muted-foreground">{campaign.error}</p>}
        </CardContent>
      </Card>
      {campaign.abTest && ab && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>A/B test</h2>
            </CardTitle>
            <CardDescription role="status">
              {campaign.abWinner
                ? `Version ${campaign.abWinner.toUpperCase()} won on ${campaign.abTest.metric} and went to everyone else.`
                : campaign.abDecideAt
                  ? `The version with more ${campaign.abTest.metric} per email goes to everyone else at ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(campaign.abDecideAt)} UTC.`
                  : "The test starts when sending begins."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(["a", "b"] as const).map((v) => (
                  <TableRow key={v}>
                    <TableCell className="font-medium">
                      {v.toUpperCase()}
                      {campaign.abWinner === v && <Badge className="ml-2">Winner</Badge>}
                    </TableCell>
                    <TableCell>{v === "a" ? campaign.subject : variantB?.subject}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ab[v].sent.toLocaleString("en")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ab[v].clicks.toLocaleString("en")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(ab[v].revenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
