import { apiListConversions, parseApiConversion, recordConversion } from "@sendcoop/db";
import { apiError, jsonBody, paging, withApiKey } from "@/lib/rest-api";
import { conversionJson } from "@/lib/rest-api-json";

/** GET /api/v1/conversions?limit=&cursor= : newest first. */
export const GET = withApiKey(async (request, { workspaceId }) => {
  const page = await apiListConversions(workspaceId, paging(new URL(request.url)));
  return Response.json({ data: page.rows.map(conversionJson), next_cursor: page.nextCursor });
});

/**
 * POST /api/v1/conversions: the same body as the signed Conversion API
 * (docs/conversion-api.md), with an API key instead of a signature.
 */
export const POST = withApiKey(async (request, { workspaceId }) => {
  const body = await jsonBody(request);
  if (!body) return apiError(400, "invalid_json", "Send a JSON object.");
  const parsed = parseApiConversion(body);
  if (!parsed.ok) return apiError(422, "invalid", parsed.error);
  const recorded = await recordConversion(workspaceId, {
    ...parsed.conversion,
    source: "api",
    network: null,
    payload: body,
  });
  return Response.json(
    { data: { result: recorded.result, id: recorded.id, attributed_by: recorded.method ?? null } },
    { status: recorded.result === "created" ? 201 : 200 },
  );
});
