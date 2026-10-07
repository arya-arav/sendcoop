"use server";

import {
  bulkAddTag,
  bulkAddToList,
  bulkDelete,
  bulkMoveToList,
  bulkRemoveFromList,
  bulkRemoveTag,
  bulkUnsubscribe,
  findOrCreateTag,
  getSegment,
  getTag,
  listLists,
  MAX_SELECTED_IDS,
  MAX_TAG_LENGTH,
  type SubscriberSelection,
  subscriberStatus,
} from "@sendcoop/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage } from "@/lib/permissions";
import { requireMemberWorkspace } from "@/lib/workspace";

export type BulkResult = { ok: true; message: string } | { ok: false; error: string };

const selectionSchema = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(MAX_SELECTED_IDS) }),
  z.object({
    filters: z.object({
      query: z.string().max(100).optional(),
      status: z.enum(subscriberStatus.enumValues).optional(),
      listId: z.uuid().optional(),
      tagId: z.uuid().optional(),
      segmentId: z.uuid().optional(),
    }),
  }),
]);

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addTag"), tagName: z.string().trim().min(1).max(MAX_TAG_LENGTH) }),
  z.object({ type: z.literal("removeTag"), tagId: z.uuid() }),
  z.object({ type: z.literal("addToList"), listId: z.uuid() }),
  z.object({ type: z.literal("removeFromList"), listId: z.uuid() }),
  z.object({ type: z.literal("moveToList"), fromListId: z.uuid(), toListId: z.uuid() }),
  z.object({ type: z.literal("unsubscribe") }),
  z.object({ type: z.literal("delete") }),
]);

export type BulkAction = z.input<typeof actionSchema>;
export type BulkSelection = z.input<typeof selectionSchema>;

const people = (n: number) =>
  `${new Intl.NumberFormat("en").format(n)} ${n === 1 ? "subscriber" : "subscribers"}`;

export async function bulkAction(
  slug: string,
  rawSelection: BulkSelection,
  rawAction: BulkAction,
): Promise<BulkResult> {
  const { workspace, role } = await requireMemberWorkspace(slug);
  if (!canManage(role)) {
    return { ok: false, error: "Only workspace owners and admins can change subscribers." };
  }
  const selection = selectionSchema.safeParse(rawSelection);
  const action = actionSchema.safeParse(rawAction);
  if (!selection.success || !action.success) {
    return { ok: false, error: "Something in the request was invalid. Reload and try again." };
  }
  const ws = workspace.id;
  let chosen: SubscriberSelection;
  if ("filters" in selection.data && selection.data.filters.segmentId) {
    // Resolve the segment here: rules never come from the browser.
    const { segmentId, ...rest } = selection.data.filters;
    const segment = await getSegment(ws, segmentId);
    if (!segment)
      return { ok: false, error: "That segment no longer exists. Reload and try again." };
    chosen = { filters: { ...rest, segment: segment.rules } };
  } else {
    chosen = selection.data as SubscriberSelection;
  }

  // Lists and tags in the action must belong to this workspace.
  const ownLists = new Map((await listLists(ws)).map((l) => [l.id, l.name]));
  const listName = (id: string) => ownLists.get(id);
  const GONE = {
    ok: false,
    error: "That list or tag no longer exists. Reload and try again.",
  } as const;

  let message: string;
  const a = action.data;
  switch (a.type) {
    case "addTag": {
      const tag = await findOrCreateTag(ws, a.tagName);
      const n = await bulkAddTag(ws, chosen, tag.id);
      message = `Tagged ${people(n)} with “${tag.name}”.`;
      break;
    }
    case "removeTag": {
      const tag = await getTag(ws, a.tagId);
      if (!tag) return GONE;
      const n = await bulkRemoveTag(ws, chosen, tag.id);
      message = `Removed “${tag.name}” from ${people(n)}.`;
      break;
    }
    case "addToList": {
      if (!listName(a.listId)) return GONE;
      const n = await bulkAddToList(ws, chosen, a.listId);
      message = `Added ${people(n)} to “${listName(a.listId)}”.`;
      break;
    }
    case "removeFromList": {
      if (!listName(a.listId)) return GONE;
      const n = await bulkRemoveFromList(ws, chosen, a.listId);
      message = `Removed ${people(n)} from “${listName(a.listId)}”.`;
      break;
    }
    case "moveToList": {
      if (!listName(a.fromListId) || !listName(a.toListId)) return GONE;
      if (a.fromListId === a.toListId) return { ok: false, error: "Choose a different list." };
      const n = await bulkMoveToList(ws, chosen, { from: a.fromListId, to: a.toListId });
      message = `Moved ${people(n)} to “${listName(a.toListId)}”.`;
      break;
    }
    case "unsubscribe": {
      const n = await bulkUnsubscribe(ws, chosen);
      message = `Unsubscribed ${people(n)}. They won't receive campaigns from this workspace.`;
      break;
    }
    case "delete": {
      const n = await bulkDelete(ws, chosen);
      message = `Deleted ${people(n)}.`;
      break;
    }
  }

  revalidatePath(`/w/${slug}/contacts`);
  revalidatePath(`/w/${slug}/lists`);
  revalidatePath(`/w/${slug}`);
  return { ok: true, message };
}
