import { getImport, listCustomFields, listLists, type SubscriberImport } from "@sendcoop/db";
import { ArrowLeft, CircleAlert, CircleCheck, Download, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { formatBytes, importStatusLabel } from "../format";
import { ImportProgress, type ImportSnapshot } from "./import-progress";
import { MappingForm } from "./mapping-form";

const DELIMITER_NAMES: Record<string, string> = {
  ",": "commas",
  ";": "semicolons",
  "\t": "tabs",
  "|": "pipes",
};

export default async function ImportMappingPage({
  params,
}: {
  params: Promise<{ slug: string; importId: string }>;
}) {
  const { slug, importId } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role) || !z.uuid().safeParse(importId).success) notFound();

  const [upload, fields, lists] = await Promise.all([
    getImport(workspace.id, importId),
    listCustomFields(workspace.id),
    listLists(workspace.id),
  ]);
  if (!upload) notFound();

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <Link
        href={`/w/${slug}/contacts/import`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Import
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-1 size-6 text-muted-foreground" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight break-all">{upload.fileName}</h1>
            <p className="text-sm text-muted-foreground">
              {formatBytes(upload.fileSize)} · {upload.columns.length} columns separated by{" "}
              {DELIMITER_NAMES[upload.delimiter] ?? `“${upload.delimiter}”`}
              {upload.hasHeader ? "" : " · no header row"}
              {upload.encoding === "windows-1252" ? " · Windows (Excel) encoding" : ""}
            </p>
          </div>
        </div>
        <Badge variant="secondary">{importStatusLabel[upload.status]}</Badge>
      </div>

      {upload.status === "draft" ? (
        <MappingForm
          slug={slug}
          importId={upload.id}
          columns={upload.columns}
          sampleRows={upload.sampleRows}
          fields={fields.map(({ key, label, type, options }) => ({ key, label, type, options }))}
          lists={lists
            .map(({ id, name }) => ({ id, name }))
            .toSorted((a, b) => a.name.localeCompare(b.name))}
          initial={{
            mapping: upload.mapping ?? { columns: upload.columns.map(() => null) },
            listIds: upload.listIds,
            updateExisting: upload.updateExisting,
          }}
          editable
        />
      ) : upload.status === "queued" || upload.status === "processing" ? (
        <ImportProgress slug={slug} importId={upload.id} initial={snapshot(upload)} />
      ) : (
        <ImportSummary slug={slug} upload={upload} />
      )}
    </div>
  );
}

const numberFormat = new Intl.NumberFormat("en");

function snapshot(upload: SubscriberImport): ImportSnapshot {
  const { status, fileSize, bytesProcessed, processedRows } = upload;
  const { createdCount, updatedCount, skippedCount, errorCount } = upload;
  return {
    status,
    fileSize,
    bytesProcessed,
    processedRows,
    createdCount,
    updatedCount,
    skippedCount,
    errorCount,
  };
}

function ImportSummary({ slug, upload }: { slug: string; upload: SubscriberImport }) {
  const failed = upload.status === "failed";
  const seconds =
    upload.startedAt && upload.finishedAt
      ? Math.max(1, Math.round((upload.finishedAt.getTime() - upload.startedAt.getTime()) / 1000))
      : null;
  const stats = [
    { label: "Added", value: upload.createdCount, hint: "New subscribers" },
    { label: "Updated", value: upload.updatedCount, hint: "Existing, with new details" },
    { label: "Already here", value: upload.skippedCount, hint: "Existing, unchanged" },
    { label: "Skipped", value: upload.errorCount, hint: "Invalid or duplicate rows" },
  ];

  return (
    <div className="grid gap-6">
      <Card
        className={failed ? "border-destructive/50" : undefined}
        role={failed ? "alert" : "status"}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {failed ? (
              <CircleAlert className="size-5 text-destructive" aria-hidden="true" />
            ) : (
              <CircleCheck className="size-5 text-emerald-600" aria-hidden="true" />
            )}
            {failed ? "Import stopped" : "Import complete"}
          </CardTitle>
          <CardDescription>
            {failed
              ? upload.error
              : `${numberFormat.format(upload.processedRows)} rows read${seconds ? ` in ${seconds}s` : ""}.`}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} size="sm">
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {numberFormat.format(stat.value)}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{stat.hint}</p>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button render={<Link href={`/w/${slug}/contacts`} />}>View contacts</Button>
        <Button variant="outline" render={<Link href={`/w/${slug}/contacts/import`} />}>
          Import another file
        </Button>
        {upload.errorReportKey && (
          <Button
            variant="outline"
            // A plain link: the browser downloads the CSV the route streams.
            render={<a href={`/api/w/${slug}/imports/${upload.id}/skipped`} download />}
          >
            <Download />
            Download skipped rows
          </Button>
        )}
      </div>
    </div>
  );
}
