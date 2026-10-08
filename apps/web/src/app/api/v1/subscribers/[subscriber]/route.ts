import {
  apiDeleteSubscriber,
  apiGetSubscriber,
  apiUpdateSubscriber,
  listCustomFields,
  ownListIds,
  parseFieldValues,
} from "@sendcoop/db";
import { z } from "zod";
import { apiError, jsonBody, notFound, withApiKey } from "@/lib/rest-api";
import { subscriberJson } from "@/lib/rest-api-json";

type Params = { subscriber: string };

/** GET /api/v1/subscribers/{id or email} */
export const GET = withApiKey<Params>(async (_request, { workspaceId }, { subscriber }) => {
  const found = await apiGetSubscriber(workspaceId, decodeURIComponent(subscriber));
  return found ? Response.json({ data: subscriberJson(found) }) : notFound("That subscriber");
});

const patchSchema = z
  .object({
    first_name: z.string().trim().max(100).nullable(),
    last_name: z.string().trim().max(100).nullable(),
    fields: z.record(z.string(), z.unknown()),
    // Only unsubscribing: subscribing someone again needs their own consent.
    status: z.literal("unsubscribed", { error: "status can only be set to unsubscribed." }),
    add_lists: z.array(z.string()).max(50),
    remove_lists: z.array(z.string()).max(50),
  })
  .partial()
  .strict();

/** PATCH /api/v1/subscribers/{id or email}: names, fields (merged), lists, unsubscribing. */
export const PATCH = withApiKey<Params>(async (request, { workspaceId }, { subscriber }) => {
  const existing = await apiGetSubscriber(workspaceId, decodeURIComponent(subscriber));
  if (!existing) return notFound("That subscriber");
  const body = await jsonBody(request);
  if (!body) return apiError(400, "invalid_json", "Send a JSON object.");
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "invalid", parsed.error.issues[0]!.message);
  const input = parsed.data;

  const named = [...(input.add_lists ?? []), ...(input.remove_lists ?? [])];
  if ((await ownListIds(workspaceId, named)).length !== new Set(named).size) {
    return apiError(422, "invalid", "A list id isn't one of this workspace's lists.");
  }
  let fields: Record<string, never> | undefined;
  if (input.fields) {
    const result = parseFieldValues(await listCustomFields(workspaceId), input.fields);
    if (!result.ok) {
      const [key, message] = Object.entries(result.errors)[0]!;
      return apiError(422, "invalid", `fields.${key}: ${message}`);
    }
    fields = result.values as Record<string, never>;
  }
  await apiUpdateSubscriber(workspaceId, existing.id, {
    firstName: input.first_name,
    lastName: input.last_name,
    fields,
    unsubscribe: input.status === "unsubscribed",
    addLists: input.add_lists,
    removeLists: input.remove_lists,
  });
  return Response.json({
    data: subscriberJson((await apiGetSubscriber(workspaceId, existing.id))!),
  });
});

/** DELETE /api/v1/subscribers/{id or email}: removes them and their history. */
export const DELETE = withApiKey<Params>(async (_request, { workspaceId }, { subscriber }) => {
  const existing = await apiGetSubscriber(workspaceId, decodeURIComponent(subscriber));
  if (!existing) return notFound("That subscriber");
  await apiDeleteSubscriber(workspaceId, existing.id);
  return new Response(null, { status: 204 });
});
