import { listSuppressions, type SuppressionReason } from "@sendcoop/db";
import { ArrowLeft, Download, Search, ShieldBan } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { AddSuppressionsButton, RemoveSuppressionButton } from "./suppression-controls";

const REASONS: Record<SuppressionReason, { label: string; variant: "secondary" | "destructive" }> =
  {
    manual: { label: "Added", variant: "secondary" },
    bounce: { label: "Hard bounce", variant: "destructive" },
    complaint: { label: "Spam complaint", variant: "destructive" },
  };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

const searchParamsSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  before: z.uuid().optional().catch(undefined),
});

export default async function SuppressionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const raw = await searchParams;
  const query = searchParamsSchema.parse({
    q: [raw.q].flat()[0],
    before: [raw.before].flat()[0],
  });
  const { workspace, role } = await requireMemberWorkspace(slug);
  const editable = canManage(role);
  const page = await listSuppressions(workspace.id, { query: query.q, before: query.before });
  const base = `/w/${slug}/contacts/suppressions`;

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <Link
        href={`/w/${slug}/contacts`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Contacts
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Suppression list</h1>
          <p className="text-sm text-muted-foreground">
            Campaigns never go to these addresses, even if they&apos;re subscribed or imported
            again. Hard bounces and spam complaints are added automatically.
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/w/${slug}/suppressions`}
              download
              className={buttonVariants({ variant: "outline" })}
            >
              <Download />
              Export CSV
            </a>
            <AddSuppressionsButton slug={slug} />
          </div>
        )}
      </div>

      <form action={base} className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          name="q"
          type="search"
          defaultValue={query.q}
          placeholder="Search addresses"
          aria-label="Search addresses"
          className="pl-8"
        />
      </form>

      {page.rows.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <ShieldBan className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">
            {query.q ? "No addresses match" : "No suppressed addresses yet"}
          </p>
          <p className="text-sm text-muted-foreground">
            Add addresses that must never get your campaigns, such as people who asked by email.
          </p>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {page.total.toLocaleString("en")} {page.total === 1 ? "address" : "addresses"}
          </p>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Email</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Added</TableHead>
                  {editable && (
                    <TableHead className="w-12 pr-4">
                      <span className="sr-only">Remove</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4 font-medium">{row.email}</TableCell>
                    <TableCell>
                      <Badge variant={REASONS[row.reason].variant}>
                        {REASONS[row.reason].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateFormat.format(row.createdAt)}
                    </TableCell>
                    {editable && (
                      <TableCell className="pr-4">
                        <RemoveSuppressionButton slug={slug} id={row.id} email={row.email} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="flex justify-end gap-2">
            {query.before && (
              <Link
                href={query.q ? `${base}?q=${encodeURIComponent(query.q)}` : base}
                className={buttonVariants({ variant: "outline" })}
              >
                Back to newest
              </Link>
            )}
            {page.nextCursor && (
              <Link
                href={`${base}?${new URLSearchParams({ ...(query.q ? { q: query.q } : {}), before: page.nextCursor })}`}
                className={buttonVariants({ variant: "outline" })}
              >
                Older
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
