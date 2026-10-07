import { SegmentEditorPage } from "../editor-page";

export default async function NewSegmentPage({ params }: { params: Promise<{ slug: string }> }) {
  return <SegmentEditorPage slug={(await params).slug} />;
}
