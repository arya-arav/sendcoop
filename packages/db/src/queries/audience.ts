import { and, count, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { getDb } from "../client";
import { type CampaignAudience, listMemberships, segments, subscribers } from "../schema";
import type { SegmentRules } from "../segments";
import { segmentSql } from "./segment-sql";
import { suppressedSql } from "./suppressions";

// Who a campaign goes to. The same condition counts recipients in the
// builder and picks them when the campaign is prepared, so the number shown
// is the number sent (give or take changes in between).

/** The rules of the workspace's segments named in an audience (others are ignored). */
async function segmentRulesFor(workspaceId: string, audience: CampaignAudience) {
  const ids = [...new Set([...audience.segments, ...audience.excludeSegments])];
  if (ids.length === 0) return new Map<string, SegmentRules>();
  const rows = await getDb()
    .select({ id: segments.id, rules: segments.rules })
    .from(segments)
    .where(and(eq(segments.workspaceId, workspaceId), inArray(segments.id, ids)));
  return new Map(rows.map((r) => [r.id, r.rules]));
}

const inLists = (listIds: string[]) =>
  sql`exists (
    select 1 from ${listMemberships}
    where ${listMemberships.subscriberId} = ${subscribers.id}
      and ${listMemberships.listId} in ${listIds})`;

/** The WHERE condition on subscribers for an audience. */
export async function audienceSql(workspaceId: string, audience: CampaignAudience): Promise<SQL> {
  const rules = await segmentRulesFor(workspaceId, audience);
  const included = audience.segments.flatMap((id) => {
    const r = rules.get(id);
    return r ? [segmentSql(r)] : [];
  });
  const excluded = audience.excludeSegments.flatMap((id) => {
    const r = rules.get(id);
    return r ? [segmentSql(r)] : [];
  });

  const include: SQL | undefined = audience.everyone
    ? undefined
    : (or(...(audience.lists.length > 0 ? [inLists(audience.lists)] : []), ...included) ??
      sql`false`); // nothing chosen: nobody
  return and(
    eq(subscribers.workspaceId, workspaceId),
    eq(subscribers.status, "subscribed"),
    sql`not ${suppressedSql(workspaceId, subscribers.email)}`,
    include,
    audience.excludeLists.length > 0 ? sql`not ${inLists(audience.excludeLists)}` : undefined,
    ...excluded.map((s) => sql`not coalesce(${s}, false)`),
  )!;
}

export async function countAudience(workspaceId: string, audience: CampaignAudience) {
  const [row] = await getDb()
    .select({ n: count() })
    .from(subscribers)
    .where(await audienceSql(workspaceId, audience));
  return row?.n ?? 0;
}
