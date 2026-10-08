"use server";

import {
  createSegment,
  deleteSegment,
  limitProblem,
  previewSegment,
  segmentRulesProblem,
  segmentRulesSchema,
  updateSegment,
} from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { segmentContext } from "@/lib/segment-context";
import { requireMemberWorkspace } from "@/lib/workspace";

export type SegmentSaveResult = { ok: true; id: string } | { ok: false; error: string };

const name = z
  .string()
  .trim()
  .min(1, "Give the segment a name.")
  .max(100, "Keep the name under 100 characters.");

export async function saveSegmentAction(
  slug: string,
  segmentId: string | null,
  input: { name: string; rules: unknown },
): Promise<SegmentSaveResult> {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false, error: "Only workspace owners and admins can change segments." };
  }
  const parsedName = name.safeParse(input.name);
  if (!parsedName.success) return { ok: false, error: parsedName.error.issues[0]!.message };
  const rules = segmentRulesSchema.safeParse(input.rules);
  if (!rules.success) return { ok: false, error: "The rules are invalid. Reload and try again." };
  if (segmentId && !z.uuid().safeParse(segmentId).success) {
    return { ok: false, error: "This segment no longer exists." };
  }
  if (!segmentId) {
    const overLimit = await limitProblem(workspace.id, "segments");
    if (overLimit) return { ok: false, error: overLimit };
  }

  const problem = segmentRulesProblem(rules.data, await segmentContext(workspace.id));
  if (problem) return { ok: false, error: problem };

  const values = { name: parsedName.data, rules: rules.data };
  const result = segmentId
    ? await updateSegment(workspace.id, segmentId, values)
    : await createSegment(workspace.id, values);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error === "duplicate"
          ? "A segment with this name already exists."
          : "This segment no longer exists.",
    };
  }

  revalidatePath(`/w/${slug}/segments`);
  return { ok: true, id: result.segment.id };
}

export async function deleteSegmentAction(slug: string, segmentId: string) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role) || !z.uuid().safeParse(segmentId).success) return { ok: false } as const;
  const deleted = await deleteSegment(workspace.id, segmentId);
  revalidatePath(`/w/${slug}/segments`);
  return { ok: deleted } as const;
}

export type SegmentPreview =
  | { ok: true; count: number; sample: { id: string; email: string }[] }
  | { ok: false; error: string };

/** Live count while editing: how many subscribers the unsaved rules match. */
export async function previewSegmentAction(slug: string, rules: unknown): Promise<SegmentPreview> {
  const { workspace } = await requireMemberWorkspace(slug);
  const parsed = segmentRulesSchema.safeParse(rules);
  if (!parsed.success) return { ok: false, error: "The rules are invalid." };
  const problem = segmentRulesProblem(parsed.data, await segmentContext(workspace.id));
  if (problem) return { ok: false, error: problem };
  const { count, sample } = await previewSegment(workspace.id, parsed.data);
  return { ok: true, count, sample };
}
