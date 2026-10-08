import { listCampaigns } from "@sendcoop/db";
import { Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { CampaignControls, LiveRefresh } from "./campaign-controls";
import { NewCampaignButton } from "./new-campaign-button";
import { STATUS_LABELS } from "./status";

export const metadata: Metadata = { title: "Campaigns" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function CampaignsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const campaigns = await listCampaigns(workspace.id);
  const editable = canManage(role);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <LiveRefresh
        active={campaigns.some((c) => c.status === "queued" || c.status === "sending")}
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            One-off emails to your lists and segments.
          </p>
        </div>
        {editable && campaigns.length > 0 && <NewCampaignButton slug={slug} />}
      </div>

      {campaigns.length === 0 ? (
        <Card className="items-center gap-3 py-12 text-center">
          <Mail className="size-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">No campaigns yet</p>
            <p className="text-sm text-muted-foreground">
              Choose who gets it, write it (or start from a template), and send.
            </p>
          </div>
          {editable && <NewCampaignButton slug={slug} label="Create your first campaign" />}
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Recipients</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead>When</TableHead>
                {editable && (
                  <TableHead className="pr-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-4 font-medium">
                    <Link href={`/w/${slug}/campaigns/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_LABELS[c.status].variant}>
                      {STATUS_LABELS[c.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.status === "draft" ? "—" : c.recipientCount.toLocaleString("en")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.status === "draft" ? "—" : c.sentCount.toLocaleString("en")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.status === "scheduled" && c.scheduledAt
                      ? `Starts ${dateTimeFormat.format(c.scheduledAt)} UTC`
                      : c.startedAt
                        ? `Started ${dateTimeFormat.format(c.startedAt)} UTC`
                        : `Created ${dateFormat.format(c.createdAt)}`}
                  </TableCell>
                  {editable && (
                    <TableCell className="pr-4">
                      <CampaignControls
                        slug={slug}
                        campaignId={c.id}
                        name={c.name}
                        status={c.status}
                        size="sm"
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
