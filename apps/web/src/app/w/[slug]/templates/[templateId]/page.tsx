import { getTemplate, listMedia } from "@sendcoop/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { appUrl } from "@/lib/app-url";
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

  // Members can look but not edit.
  if (!canManage(role)) redirect(`/w/${slug}/templates/${template.id}/preview`);

  return (
    <VisualEditor
      slug={slug}
      templateId={template.id}
      initialName={template.name}
      design={template.design}
      mjml={template.mjml}
      assets={`${appUrl()}/email`}
      images={(await listMedia(workspace.id)).map((m) => ({
        src: m.url,
        width: m.width,
        height: m.height,
        name: m.fileName,
      }))}
    />
  );
}
