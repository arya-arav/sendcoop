import { listImports } from "@sendcoop/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { CsvUploader } from "./csv-uploader";
import { formatBytes, importStatusLabel } from "./format";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const numberFormat = new Intl.NumberFormat("en");

export default async function ImportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) notFound();
  const imports = await listImports(workspace.id);

  return (
    <div className="grid gap-6">
      <Link
        href={`/w/${slug}/contacts`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Contacts
      </Link>

      <div>
        <h1 className="text-[22px] font-semibold">Import subscribers</h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV exported from another tool or a spreadsheet. You&apos;ll match its columns to
          subscriber fields next.
        </p>
      </div>

      <CsvUploader slug={slug} />

      {imports.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Recent uploads</h2>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">File</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="pr-4">Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="pl-4 font-medium">
                      <Link
                        href={`/w/${slug}/contacts/import/${item.id}`}
                        className="hover:underline"
                      >
                        {item.fileName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatBytes(item.fileSize)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.status === "failed"
                            ? "destructive"
                            : item.status === "completed"
                              ? "outline"
                              : "secondary"
                        }
                      >
                        {importStatusLabel[item.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.status === "completed"
                        ? `${numberFormat.format(item.createdCount)} added${item.errorCount ? `, ${numberFormat.format(item.errorCount)} skipped` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-muted-foreground">
                      {dateFormat.format(item.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>
      )}
    </div>
  );
}
