import { FormEditorPage } from "../editor-page";

export default async function NewFormPage({ params }: { params: Promise<{ slug: string }> }) {
  return <FormEditorPage slug={(await params).slug} />;
}
