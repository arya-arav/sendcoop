import { listSendingDomains } from "@sendcoop/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
import { AddDomainForm } from "./add-domain";
import { DomainStatusBadge } from "./status-badge";

export default async function DomainsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const domains = await listSendingDomains(workspace.id);

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <Link
        href={`/w/${slug}/settings`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Settings
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sending domains</h1>
        <p className="text-sm text-muted-foreground">
          Gmail and Yahoo reject bulk mail from domains without SPF, DKIM and DMARC. Add yours and
          we&apos;ll give you the records to publish.
        </p>
      </div>

      {canManage(role) && <AddDomainForm slug={slug} />}

      {domains.length > 0 && (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Domain</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="pl-4 font-medium">
                    <Link href={`/w/${slug}/settings/domains/${d.id}`} className="hover:underline">
                      {d.domain}
                    </Link>
                  </TableCell>
                  <TableCell className="pr-4">
                    <DomainStatusBadge status={d.status} />
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
