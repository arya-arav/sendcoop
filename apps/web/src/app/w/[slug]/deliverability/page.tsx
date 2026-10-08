import {
  HEALTH_LIMITS,
  type HealthLevel,
  healthLevel,
  healthRates,
  listCampaignHealth,
  workspaceHealth,
} from "@sendcoop/db";
import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
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
import { ResumeButton } from "./resume-button";

export const metadata: Metadata = { title: "Deliverability" };

const pct = (rate: number) => `${(rate * 100).toLocaleString("en", { maximumFractionDigits: 2 })}%`;
const count = (n: number) => n.toLocaleString("en");

const LEVELS: Record<
  HealthLevel,
  { label: string; variant: "secondary" | "outline" | "destructive" }
> = {
  good: { label: "Healthy", variant: "secondary" },
  warning: { label: "Watch", variant: "outline" },
  danger: { label: "Too high", variant: "destructive" },
};

const STATUS: Record<string, string> = {
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  paused: "Paused",
  canceled: "Canceled",
  failed: "Failed",
};

function Metric({
  title,
  value,
  detail,
  level,
}: {
  title: string;
  value: string;
  detail: string;
  level?: HealthLevel;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
          {value}
          {level && <Badge variant={LEVELS[level].variant}>{LEVELS[level].label}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  );
}

export default async function DeliverabilityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const [totals, campaigns] = await Promise.all([
    workspaceHealth(workspace.id),
    listCampaignHealth(workspace.id),
  ]);
  const rates = healthRates(totals);
  const enough = totals.sent >= HEALTH_LIMITS.minSent;
  const paused = campaigns.filter((c) => c.status === "paused");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-[22px] font-semibold">Deliverability</h1>
        <p className="text-sm text-muted-foreground">
          How mailbox providers see your emails over the last 30 days. Campaigns pause themselves
          when bounces or spam complaints get too high, before they hurt your reputation.
        </p>
      </div>

      {paused.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleAlert className="size-5 text-destructive" aria-hidden="true" />
              <h2>
                {paused.length === 1
                  ? "1 campaign is paused"
                  : `${paused.length} campaigns are paused`}
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {paused.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-muted-foreground">{c.error ?? "Paused."}</p>
                </div>
                {canManage(role) && <ResumeButton slug={slug} campaignId={c.id} name={c.name} />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <section aria-label="Last 30 days" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Emails sent" value={count(totals.sent)} detail="In the last 30 days." />
        <Metric
          title="Bounce rate"
          value={pct(rates.bounceRate)}
          level={enough ? healthLevel(rates.bounceRate, HEALTH_LIMITS.bounce) : undefined}
          detail={`Hard bounces. Keep under ${pct(HEALTH_LIMITS.bounce.warn)}; campaigns pause at ${pct(HEALTH_LIMITS.bounce.pause)}.`}
        />
        <Metric
          title="Spam complaint rate"
          value={pct(rates.complaintRate)}
          level={enough ? healthLevel(rates.complaintRate, HEALTH_LIMITS.complaint) : undefined}
          detail={`Keep under ${pct(HEALTH_LIMITS.complaint.warn)}; campaigns pause at ${pct(HEALTH_LIMITS.complaint.pause)} (Gmail's limit).`}
        />
        <Metric
          title="Unsubscribe rate"
          value={pct(rates.unsubscribeRate)}
          detail={`${count(totals.unsubscribed)} unsubscribed from a campaign email.`}
        />
      </section>
      {!enough && (
        <p className="text-sm text-muted-foreground">
          Healthy or not is judged once at least {HEALTH_LIMITS.minSent} emails have gone out.
        </p>
      )}

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Bounces</TableHead>
              <TableHead className="text-right">Complaints</TableHead>
              <TableHead className="pr-4 text-right">Unsubscribes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No campaigns sent yet.
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((c) => {
                const r = healthRates(c);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4 font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "paused" ? "destructive" : "secondary"}>
                        {STATUS[c.status] ?? c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{count(c.sent)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {count(c.bounced)}{" "}
                      <span className="text-muted-foreground">({pct(r.bounceRate)})</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {count(c.complained)}{" "}
                      <span className="text-muted-foreground">({pct(r.complaintRate)})</span>
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">
                      {count(c.unsubscribed)}{" "}
                      <span className="text-muted-foreground">({pct(r.unsubscribeRate)})</span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
