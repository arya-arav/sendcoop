import { listCustomFields, listLists, listTags, segmentFields } from "@sendcoop/db";

// Not in a "use server" file on purpose: exported functions there become public
// endpoints, and this takes a workspace id without checking access.

/** The workspace context segment rules are checked against (fields, lists, tags). */
export async function segmentContext(workspaceId: string) {
  const [customFields, lists, tags] = await Promise.all([
    listCustomFields(workspaceId),
    listLists(workspaceId),
    listTags(workspaceId),
  ]);
  return {
    customFields,
    lists,
    tags,
    fields: segmentFields(customFields),
    listIds: new Set(lists.map((l) => l.id)),
    tagIds: new Set(tags.map((t) => t.id)),
  };
}
