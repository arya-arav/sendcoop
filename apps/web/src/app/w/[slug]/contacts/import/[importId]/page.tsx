import { getImport, listCustomFields, listLists } from "@sendcoop/db";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { formatBytes, importStatusLabel } from "../format";
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
        editable={upload.status === "draft"}
      />
    </div>
  );
}
