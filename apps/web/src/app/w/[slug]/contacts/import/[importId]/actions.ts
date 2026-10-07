"use server";

import {
  getImport,
  type ImportMapping,
  listCustomFields,
  listLists,
  mappingProblem,
  saveImportMapping,
} from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

export type MappingResult = { ok: true } | { ok: false; error: string };

const input = z.object({
  columns: z.array(z.string().nullable()).max(100),
  listIds: z.array(z.uuid()).max(100),
  updateExisting: z.boolean(),
});

export async function saveMappingAction(
  slug: string,
  importId: string,
  raw: { columns: (string | null)[]; listIds: string[]; updateExisting: boolean },
): Promise<MappingResult> {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false, error: "Only workspace owners and admins can import subscribers." };
  }
  const parsed = input.safeParse(raw);
  if (!parsed.success || !z.uuid().safeParse(importId).success) {
    return { ok: false, error: "Something in the form was invalid. Reload and try again." };
  }

  const [upload, fields, lists] = await Promise.all([
    getImport(workspace.id, importId),
    listCustomFields(workspace.id),
    listLists(workspace.id),
  ]);
  if (!upload) return { ok: false, error: "This import no longer exists." };

  const mapping = { columns: parsed.data.columns } as ImportMapping;
  const problem = mappingProblem(mapping, upload.columns.length, fields);
  if (problem) return { ok: false, error: problem };

  const ownLists = new Set(lists.map((l) => l.id));
  if (!parsed.data.listIds.every((id) => ownLists.has(id))) {
    return { ok: false, error: "One of the lists no longer exists. Reload and try again." };
  }

  const saved = await saveImportMapping(workspace.id, importId, {
    mapping,
    listIds: parsed.data.listIds,
    updateExisting: parsed.data.updateExisting,
  });
  if (!saved) return { ok: false, error: "This import has already started and can't change." };

  revalidatePath(`/w/${slug}/contacts/import/${importId}`);
  return { ok: true };
}
