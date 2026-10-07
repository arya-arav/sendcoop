import { getForm } from "@sendcoop/db";
import { notFound } from "next/navigation";
import { z } from "zod";
import { FormEditorPage } from "../editor-page";

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ slug: string; formId: string }>;
}) {
  const { slug, formId } = await params;
  if (!z.uuid().safeParse(formId).success) notFound();
  return <FormEditorPage slug={slug} load={(workspaceId) => getForm(workspaceId, formId)} />;
}
