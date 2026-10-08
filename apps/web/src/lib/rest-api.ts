import { authenticateApiKey, getWorkspacePlan } from "@sendcoop/db";
import { withinRateLimit } from "./rate-limit";

// The public REST API (D77): /api/v1, with a workspace's API key as a
// Bearer token. Every answer is JSON: { data, next_cursor? } or
// { error: { code, message } }. Described in /api/v1/openapi.json.

export type ApiContext = { workspaceId: string; keyId: string };

/** Requests per key per minute. */
export const API_RATE_LIMIT = 300;

export function apiError(status: number, code: string, message: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers });
}

export const notFound = (what = "That") => apiError(404, "not_found", `${what} doesn't exist.`);

/** Wraps a route handler: the key, the plan's API feature, the rate limit, errors. */
export function withApiKey<P>(
  handler: (request: Request, context: ApiContext, params: P) => Promise<Response>,
) {
  return async (request: Request, { params }: { params: Promise<P> }) => {
    const header = request.headers.get("authorization") ?? "";
    const token = header.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) {
      return apiError(401, "unauthorized", "Send your API key as 'Authorization: Bearer <key>'.");
    }
    const key = await authenticateApiKey(token);
    if (!key) return apiError(401, "unauthorized", "That API key isn't valid, or was revoked.");
    const plan = await getWorkspacePlan(key.workspaceId);
    if (!plan.features.api) {
      return apiError(
        403,
        "plan_required",
        `The API isn't part of the ${plan.plan.name} plan. Upgrade in Settings > Billing.`,
      );
    }
    if (!(await withinRateLimit(`api:${key.id}`, API_RATE_LIMIT, 60))) {
      return apiError(429, "rate_limited", `Up to ${API_RATE_LIMIT} requests a minute per key.`, {
        "retry-after": "60",
      });
    }
    try {
      return await handler(request, { workspaceId: key.workspaceId, keyId: key.id }, await params);
    } catch (error) {
      console.error("[api] request failed", error);
      return apiError(500, "server_error", "Something went wrong on our side. Try again.");
    }
  };
}

/** The JSON body, or null when it isn't a JSON object. */
export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > 100_000) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** ?limit= (1–100, default 50) and ?cursor= (an id from next_cursor). */
export function paging(url: URL) {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const cursor = url.searchParams.get("cursor");
  return { limit, cursor: cursor && /^[0-9a-f-]{36}$/i.test(cursor) ? cursor : null };
}
