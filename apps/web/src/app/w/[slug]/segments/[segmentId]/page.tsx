import { getSegment } from "@sendcoop/db";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SegmentEditorPage } from "../editor-page";

export default async function EditSegmentPage({
  params,
}: {
  params: Promise<{ slug: string; segmentId: string }>;
}) {
  const { slug, segmentId } = await params;
  if (!z.uuid().safeParse(segmentId).success) notFound();
  return (
    <SegmentEditorPage slug={slug} load={(workspaceId) => getSegment(workspaceId, segmentId)} />
  );
}
