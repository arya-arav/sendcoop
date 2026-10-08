import { EMPTY_RULES, type Segment } from "@sendcoop/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManage } from "@/lib/permissions";
import { segmentContext } from "@/lib/segment-context";
import { requireMemberWorkspace } from "@/lib/workspace";
import { SegmentEditor } from "./segment-editor";

/** Shared by /segments/new and /segments/[segmentId]. */
export async function SegmentEditorPage({
  slug,
  load,
}: {
  slug: string;
  load?: (workspaceId: string) => Promise<Segment | null>;
}) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) notFound();
  const segment = load ? await load(workspace.id) : null;
  if (load && !segment) notFound();
  const { fields, lists, tags, campaigns } = await segmentContext(workspace.id);

  return (
    <div className="grid gap-6">
      <Link
        href={`/w/${slug}/segments`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Segments
      </Link>
      <h1 className="text-[22px] font-semibold">{segment ? segment.name : "New segment"}</h1>
      <SegmentEditor
        slug={slug}
        segmentId={segment?.id ?? null}
        initialName={segment?.name ?? ""}
        initialRules={segment?.rules ?? EMPTY_RULES}
        fields={fields}
        lists={lists.map(({ id, name }) => ({ id, name }))}
        tags={tags.map(({ id, name }) => ({ id, name }))}
        campaigns={campaigns}
      />
    </div>
  );
}
