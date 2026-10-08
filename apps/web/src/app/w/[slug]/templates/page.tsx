import { listTemplates, type TemplateEditor } from "@sendcoop/db";
import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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

export const metadata: Metadata = { title: "Templates" };

const EDITORS: Record<TemplateEditor, string> = {
  visual: "Drag and drop",
  html: "HTML",
  text: "Plain text",
};

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export default async function TemplatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  const templates = await listTemplates(workspace.id);
  const editable = canManage(role);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Reusable email designs. Start one from the gallery or from scratch.
          </p>
        </div>
        {editable && templates.length > 0 && (
          <Link href={`/w/${slug}/templates/new`} className={buttonVariants()}>
            <Plus />
            New template
          </Link>
        )}
      </div>

      {templates.length === 0 ? (
        <Card className="items-center gap-3 py-12 text-center">
          <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">No templates yet</p>
            <p className="text-sm text-muted-foreground">
              Design an email once with the drag-and-drop editor and reuse it.
            </p>
          </div>
          {editable && (
            <Link href={`/w/${slug}/templates/new`} className={buttonVariants()}>
              <Plus />
              Create your first template
            </Link>
          )}
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Editor</TableHead>
                <TableHead className="pr-4">Last edited</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-4 font-medium">
                    <Link href={`/w/${slug}/templates/${t.id}`} className="hover:underline">
                      {t.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{EDITORS[t.editor]}</Badge>
                  </TableCell>
                  <TableCell className="pr-4 text-muted-foreground">
                    {dateFormat.format(t.updatedAt)}
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
