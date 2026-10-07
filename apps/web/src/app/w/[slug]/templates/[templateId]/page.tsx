import { getTemplate } from "@sendcoop/db";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { VisualEditor } from "./visual-editor";

export const metadata: Metadata = { title: "Edit template" };

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ slug: string; templateId: string }>;
}) {
  const { slug, templateId } = await params;
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!z.uuid().safeParse(templateId).success) notFound();
  const template = await getTemplate(workspace.id, templateId);
  if (!template) notFound();

  if (!canManage(role)) {
    // Members can look but not edit: a preview, sandboxed (no scripts run).
    return (
      <div className="mx-auto grid max-w-4xl gap-4">
        <Link
          href={`/w/${slug}/templates`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Templates
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
        <iframe
          title={`Preview of ${template.name}`}
          sandbox=""
          srcDoc={template.html}
          className="h-[70dvh] w-full rounded-lg border bg-white"
        />
      </div>
    );
  }

  return (
    <VisualEditor
      slug={slug}
      templateId={template.id}
      initialName={template.name}
      design={template.design}
      mjml={template.mjml}
    />
  );
}
