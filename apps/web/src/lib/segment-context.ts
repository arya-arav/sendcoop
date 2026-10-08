import { listCampaigns, listCustomFields, listLists, listTags, segmentFields } from "@sendcoop/db";

// Not in a "use server" file on purpose: exported functions there become public
// endpoints, and this takes a workspace id without checking access.

/** The workspace context segment rules are checked against (fields, lists, tags, campaigns). */
export async function segmentContext(workspaceId: string) {
  const [customFields, lists, tags, allCampaigns] = await Promise.all([
    listCustomFields(workspaceId),
    listLists(workspaceId),
    listTags(workspaceId),
    listCampaigns(workspaceId),
  ]);
  // Activity conditions name campaigns that went out; drafts have no activity.
  const campaigns = allCampaigns
    .filter((c) => c.status !== "draft" && c.status !== "scheduled")
    .map((c) => ({ id: c.id, name: c.name }));
  return {
    customFields,
    lists,
    tags,
    campaigns,
    fields: segmentFields(customFields),
    listIds: new Set(lists.map((l) => l.id)),
    tagIds: new Set(tags.map((t) => t.id)),
    campaignIds: new Set(campaigns.map((c) => c.id)),
  };
}
