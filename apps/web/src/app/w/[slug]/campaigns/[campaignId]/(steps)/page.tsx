import { abResults, getCampaign, getVariantB, listCampaignLinks, networkName } from "@sendcoop/db";
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
import { CampaignControls, LiveRefresh } from "../../campaign-controls";
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
          {canManage(role) && (
            <div className="flex flex-wrap items-center gap-2">
              <UnscheduleButton slug={slug} campaignId={campaign.id} />
              <CampaignControls
                slug={slug}
                campaignId={campaign.id}
                name={campaign.name}
                status={campaign.status}
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const ab = campaign.abTest ? await abResults(campaign.id) : null;
  const links = await listCampaignLinks(workspace.id, campaign.id);
  const variantB = campaign.abTest ? await getVariantB(campaign.id) : null;
  const money = (n: number) => n.toLocaleString("en", { style: "currency", currency: "USD" });

  return (
    <div className="grid gap-6">
      <LiveRefresh active={campaign.status === "queued" || campaign.status === "sending"} />
      <Card>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status">
              {campaign.status === "queued"
                ? "Getting ready to send…"
                : `Sent to ${campaign.sentCount.toLocaleString("en")} of ${campaign.recipientCount.toLocaleString("en")} recipients.`}
            </p>
            {canManage(role) && (
              <CampaignControls
                slug={slug}
                campaignId={campaign.id}
                name={campaign.name}
                status={campaign.status}
              />
            )}
          </div>
          {campaign.recipientCount > 0 && (
            <div
              role="progressbar"
              aria-label="Sending progress"
              aria-valuemin={0}
              aria-valuemax={campaign.recipientCount}
              aria-valuenow={campaign.sentCount}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-foreground transition-[width]"
                style={{
                  width: `${Math.min(100, (campaign.sentCount / campaign.recipientCount) * 100)}%`,
                }}
              />
            </div>
          )}
          {campaign.status === "paused" && (
            <p className="text-muted-foreground">
              {campaign.error ?? "Paused. Nobody else gets it until you resume."}
            </p>
          )}
          {campaign.status !== "paused" && campaign.error && (
            <p className="text-muted-foreground">{campaign.error}</p>
          )}
          {campaign.status === "canceled" && (
            <p className="text-muted-foreground">Canceled. Nobody else will get it.</p>
          )}
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
      {links.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Links</h2>
            </CardTitle>
            <CardDescription>
              Every link in the email, in order. Clicks per link arrive with click tracking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  {campaign.abTest && <TableHead>Version</TableHead>}
                  <TableHead>Link</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {link.position + 1}
                    </TableCell>
                    {campaign.abTest && <TableCell>{link.variant.toUpperCase()}</TableCell>}
                    <TableCell className="max-w-md">
                      <p className="truncate font-medium">{link.label ?? link.url}</p>
                      {link.label && (
                        <p className="truncate text-xs text-muted-foreground">{link.url}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {link.isAffiliate ? (
                        <Badge>Affiliate: {networkName(link.networkId)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">Link</span>
                      )}
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
