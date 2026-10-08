import { getTemplate, listMedia } from "@sendcoop/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { appUrl } from "@/lib/app-url";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";
import { DeleteTemplateButton } from "../template-actions";
import { CodeEditor } from "./code-editor";
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

  // Where the editor saves, and its header: name, subject, preview and delete.
  const target = {
    saveUrl: `/api/w/${slug}/templates/${template.id}`,
    backHref: `/w/${slug}/templates`,
    backLabel: "Back to templates",
    previewHref: `/w/${slug}/templates/${template.id}/preview`,
    meta: { name: template.name, subject: template.subject },
    actions: <DeleteTemplateButton slug={slug} id={template.id} name={template.name} />,
  };

  if (template.editor !== "visual") {
    return (
      <CodeEditor
        target={target}
        mode={template.editor}
        initialContent={template.editor === "html" ? template.html : template.text}
      />
    );
  }

  return (
    <VisualEditor
      slug={slug}
      target={target}
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
