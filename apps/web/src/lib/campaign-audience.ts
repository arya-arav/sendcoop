import { type CampaignAudience, listLists, listSegments } from "@sendcoop/db";
import { z } from "zod";

// An audience sent from the browser: validated, and limited to the
// workspace's own lists and segments (anything else is dropped).

const ids = z.array(z.uuid()).max(100);

export const audienceSchema = z.object({
  everyone: z.boolean(),
  lists: ids,
  segments: ids,
  excludeLists: ids,
  excludeSegments: ids,
});

export async function cleanAudience(
  workspaceId: string,
  input: unknown,
): Promise<CampaignAudience | null> {
  const parsed = audienceSchema.safeParse(input);
  if (!parsed.success) return null;
  const [lists, segments] = await Promise.all([listLists(workspaceId), listSegments(workspaceId)]);
  const listIds = new Set(lists.map((l) => l.id));
  const segmentIds = new Set(segments.map((s) => s.id));
  const a = parsed.data;
  return {
    everyone: a.everyone,
    // With everyone chosen, lists and segments to include don't matter.
    lists: a.everyone ? [] : [...new Set(a.lists)].filter((id) => listIds.has(id)),
    segments: a.everyone ? [] : [...new Set(a.segments)].filter((id) => segmentIds.has(id)),
    excludeLists: [...new Set(a.excludeLists)].filter((id) => listIds.has(id)),
    excludeSegments: [...new Set(a.excludeSegments)].filter((id) => segmentIds.has(id)),
  };
}
