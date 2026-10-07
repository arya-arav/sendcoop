"use server";

import {
  getImport,
  type ImportMapping,
  listCustomFields,
  listLists,
  mappingProblem,
  queueImport,
  saveImportMapping,
} from "@sendcoop/db";
import { enqueueImport } from "@sendcoop/queue";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

export type MappingResult = { ok: true } | { ok: false; error: string };
type MappingInput = { columns: (string | null)[]; listIds: string[]; updateExisting: boolean };

const input = z.object({
  columns: z.array(z.string().nullable()).max(100),
  listIds: z.array(z.uuid()).max(100),
  updateExisting: z.boolean(),
});

/** Checks permissions and the mapping; returns what to save, or an error. */
async function validated(slug: string, importId: string, raw: MappingInput) {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return {
      ok: false,
      error: "Only workspace owners and admins can import subscribers.",
    } as const;
  }
  const parsed = input.safeParse(raw);
  if (!parsed.success || !z.uuid().safeParse(importId).success) {
    return {
      ok: false,
      error: "Something in the form was invalid. Reload and try again.",
    } as const;
  }

  const [upload, fields, lists] = await Promise.all([
    getImport(workspace.id, importId),
    listCustomFields(workspace.id),
    listLists(workspace.id),
  ]);
  if (!upload) return { ok: false, error: "This import no longer exists." } as const;

  const mapping = { columns: parsed.data.columns } as ImportMapping;
  const problem = mappingProblem(mapping, upload.columns.length, fields);
  if (problem) return { ok: false, error: problem } as const;

  const ownLists = new Set(lists.map((l) => l.id));
  if (!parsed.data.listIds.every((id) => ownLists.has(id))) {
    return {
      ok: false,
      error: "One of the lists no longer exists. Reload and try again.",
    } as const;
  }

  return {
    ok: true,
    workspaceId: workspace.id,
    values: {
      mapping,
      listIds: parsed.data.listIds,
      updateExisting: parsed.data.updateExisting,
    },
  } as const;
}

const ALREADY_STARTED = "This import has already started and can't change.";

export async function saveMappingAction(
  slug: string,
  importId: string,
  raw: MappingInput,
): Promise<MappingResult> {
  const checked = await validated(slug, importId, raw);
  if (!checked.ok) return checked;

  if (!(await saveImportMapping(checked.workspaceId, importId, checked.values))) {
    return { ok: false, error: ALREADY_STARTED };
  }
  revalidatePath(`/w/${slug}/contacts/import/${importId}`);
  return { ok: true };
}

export async function startImportAction(
  slug: string,
  importId: string,
  raw: MappingInput & { consent: boolean },
): Promise<MappingResult> {
  if (raw.consent !== true) {
    return { ok: false, error: "Confirm that these people agreed to receive your email." };
  }
  const checked = await validated(slug, importId, raw);
  if (!checked.ok) return checked;

  // Moving draft -> queued first means a double click can't queue it twice.
  if (!(await queueImport(checked.workspaceId, importId, checked.values))) {
    return { ok: false, error: ALREADY_STARTED };
  }
  await enqueueImport({ importId, workspaceId: checked.workspaceId });

  revalidatePath(`/w/${slug}/contacts/import/${importId}`);
  revalidatePath(`/w/${slug}/contacts/import`);
  return { ok: true };
}
