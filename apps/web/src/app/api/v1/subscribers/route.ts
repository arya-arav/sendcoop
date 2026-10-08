import {
  apiGetSubscriber,
  apiListSubscribers,
  createSubscriber,
  listCustomFields,
  ownListIds,
  parseFieldValues,
  subscriberQuotaProblem,
  workspaceQuota,
} from "@sendcoop/db";
import { z } from "zod";
import { apiError, jsonBody, paging, withApiKey } from "@/lib/rest-api";
import { subscriberJson } from "@/lib/rest-api-json";

const STATUSES = ["subscribed", "pending", "unsubscribed", "bounced", "complained"] as const;

/** GET /api/v1/subscribers?status=&list_id=&limit=&cursor= */
export const GET = withApiKey(async (request, { workspaceId }) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return apiError(422, "invalid", `status is one of ${STATUSES.join(", ")}.`);
  }
  const page = await apiListSubscribers(workspaceId, {
    ...paging(url),
    status,
    listId: url.searchParams.get("list_id"),
  });
  return Response.json({ data: page.rows.map(subscriberJson), next_cursor: page.nextCursor });
});

const createSchema = z.object({
  email: z.email({ error: "email must be a valid address." }),
  first_name: z.string().trim().max(100).nullish(),
  last_name: z.string().trim().max(100).nullish(),
  fields: z.record(z.string(), z.unknown()).optional(),
  lists: z.array(z.string()).max(50).optional(),
});

/** POST /api/v1/subscribers: adds someone (subscribed straight away). */
export const POST = withApiKey(async (request, { workspaceId }) => {
  const body = await jsonBody(request);
  if (!body) return apiError(400, "invalid_json", "Send a JSON object.");
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "invalid", parsed.error.issues[0]!.message);
  const input = parsed.data;

  const listIds = await ownListIds(workspaceId, input.lists ?? []);
  if (listIds.length !== new Set(input.lists ?? []).size) {
    return apiError(422, "invalid", "lists has an id that isn't one of this workspace's lists.");
  }
  const fields = parseFieldValues(await listCustomFields(workspaceId), input.fields ?? {});
  if (!fields.ok) {
    const [key, message] = Object.entries(fields.errors)[0]!;
    return apiError(422, "invalid", `fields.${key}: ${message}`);
  }
  const overLimit = subscriberQuotaProblem(await workspaceQuota(workspaceId));
  if (overLimit) return apiError(403, "quota_exceeded", overLimit);

  const created = await createSubscriber(
    workspaceId,
    {
      email: input.email,
      firstName: input.first_name ?? null,
      lastName: input.last_name ?? null,
      source: "api",
      fields: fields.values,
    },
    listIds,
  );
  if (!created.ok) {
    return created.error === "duplicate"
      ? apiError(409, "already_exists", "That email is already a subscriber. PATCH it instead.")
      : apiError(422, "invalid", "lists has an id that isn't one of this workspace's lists.");
  }
  const subscriber = await apiGetSubscriber(workspaceId, created.subscriber.id);
  return Response.json({ data: subscriberJson(subscriber!) }, { status: 201 });
});
