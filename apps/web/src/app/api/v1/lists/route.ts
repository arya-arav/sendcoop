import { listLists } from "@sendcoop/db";
import { withApiKey } from "@/lib/rest-api";

/** GET /api/v1/lists: every list, with how many subscribers it has. */
export const GET = withApiKey(async (_request, { workspaceId }) => {
  const lists = await listLists(workspaceId);
  return Response.json({
    data: lists.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      subscriber_count: l.subscriberCount,
      created_at: new Date(l.createdAt).toISOString(),
    })),
  });
});
