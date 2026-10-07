import { listSendingServers } from "@sendcoop/db";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export default async function ServersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const servers = await listSendingServers(workspace.id);

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <Link
        href={`/w/${slug}/settings`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Settings
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sending servers</h1>
          <p className="text-sm text-muted-foreground">
            The service that delivers your campaigns: Amazon SES or any SMTP provider.
          </p>
        </div>
        {canManage(role) && (
          <Button render={<Link href={`/w/${slug}/settings/servers/new`} />}>
            <Plus />
            Add server
          </Button>
        )}
      </div>

      {servers.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <p className="font-medium">No sending servers yet</p>
          <p className="text-sm text-muted-foreground">
            Amazon SES is the cheapest at volume; any SMTP provider works too.
          </p>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Connection</TableHead>
                <TableHead className="pr-4">Limits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="pl-4 font-medium">
                    <Link href={`/w/${slug}/settings/servers/${s.id}`} className="hover:underline">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{s.type === "ses" ? "Amazon SES" : "SMTP"}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.summary}</TableCell>
                  <TableCell className="pr-4 text-muted-foreground">
                    {[
                      s.maxPerSecond && `${s.maxPerSecond}/s`,
                      s.maxPerHour && `${s.maxPerHour}/h`,
                      s.maxPerDay && `${s.maxPerDay}/day`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "None"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
