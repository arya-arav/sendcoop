import { listAutomations } from "@sendcoop/db";
import { Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { NewAutomationButton } from "./new-automation-button";

export const metadata: Metadata = { title: "Automations" };

const STATUS: Record<string, { label: string; variant: "secondary" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  active: { label: "Live", variant: "secondary" },
  paused: { label: "Paused", variant: "outline" },
};

export default async function AutomationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const automations = await listAutomations(workspace.id);
  const editable = canManage(role);

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
          <p className="text-sm text-muted-foreground">
            Emails that go out on their own: when someone joins, buys, clicks without buying, or
            reaches a date.
          </p>
        </div>
        {editable && <NewAutomationButton slug={slug} />}
      </div>
      {automations.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-2 py-10 text-center">
            <Workflow className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">No automations yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              A welcome series, a follow-up for people who clicked but didn&apos;t buy, a thank-you
              after a purchase.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Table aria-label="Automations">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Steps</TableHead>
              <TableHead className="text-right">In progress</TableHead>
              <TableHead className="text-right">Finished</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {automations.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  {editable ? (
                    <Link
                      href={`/w/${slug}/automations/${a.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {a.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{a.name}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS[a.status]!.variant}>{STATUS[a.status]!.label}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{a.steps}</TableCell>
                <TableCell className="text-right tabular-nums">{a.live}</TableCell>
                <TableCell className="text-right tabular-nums">{a.finished}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
