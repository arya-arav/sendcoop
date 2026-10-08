import { sql } from "drizzle-orm";
import { ACCOUNT_HEALTH, DISPOSABLE_DOMAINS, ROLE_PREFIXES } from "../abuse";
import { getDb } from "../client";
import type { CampaignAudience } from "../schema";
import { audienceSql } from "./audience";

// Abuse protection's database side (D76): list quality for a campaign's
// audience, and suspending accounts whose recent sends drew too many
// complaints or bounces.

// Constant lists of plain words and domains, so they can go in the SQL as is.
const literals = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", "));
const ROLES = literals(ROLE_PREFIXES);
const DISPOSABLE = literals(DISPOSABLE_DOMAINS);

/** How many of an audience are role addresses or throwaway inboxes. */
export async function audienceQuality(workspaceId: string, audience: CampaignAudience) {
  const [row] = await getDb().execute<{ total: number; role: number; disposable: number }>(sql`
    select count(*)::int as total,
           count(*) filter (where split_part(lower(email), '@', 1) in (${ROLES})
                              and not split_part(lower(email), '@', 2) in (${DISPOSABLE}))::int as role,
           count(*) filter (where split_part(lower(email), '@', 2) in (${DISPOSABLE}))::int as disposable
    from subscribers where ${await audienceSql(workspaceId, audience)}`);
  return row ?? { total: 0, role: 0, disposable: 0 };
}

const percent = (rate: number) =>
  `${(rate * 100).toLocaleString("en", { maximumFractionDigits: 2 })}%`;

/**
 * Suspends an account whose emails of the last week drew complaints or hard
 * bounces past ACCOUNT_HEALTH, ends its sessions and pauses its sending
 * campaigns. Returns the reason when it suspended it.
 */
export async function enforceAccountHealth(userId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db.execute<{
    sent: number;
    bounced: number;
    complained: number;
    banned: boolean;
    role: string | null;
  }>(sql`
    select count(*) filter (where m.status = 'sent')::int as sent,
           count(*) filter (where m.bounce_type = 'hard')::int as bounced,
           count(*) filter (where m.complained_at is not null)::int as complained,
           (select banned from users where id = ${userId}) as banned,
           (select role from users where id = ${userId}) as role
    from messages m
    where m.workspace_id in (select workspace_id from memberships where user_id = ${userId} and role like '%owner%')
      and m.sent_at >= now() - make_interval(days => ${ACCOUNT_HEALTH.days}::int)`);
  if (!row || row.banned || row.role === "admin" || row.sent < ACCOUNT_HEALTH.minSent) return null;
  const complaintRate = row.complained / row.sent;
  const bounceRate = row.bounced / row.sent;
  const reason =
    complaintRate >= ACCOUNT_HEALTH.complaint
      ? `Suspended automatically: ${percent(complaintRate)} of last week's emails were marked as spam (the limit is ${percent(ACCOUNT_HEALTH.complaint)}).`
      : bounceRate >= ACCOUNT_HEALTH.bounce
        ? `Suspended automatically: ${percent(bounceRate)} of last week's emails bounced (the limit is ${percent(ACCOUNT_HEALTH.bounce)}).`
        : null;
  if (!reason) return null;
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update users set banned = true, ban_reason = ${reason}, updated_at = now()
      where id = ${userId} and not banned`);
    await tx.execute(sql`delete from sessions where user_id = ${userId}`);
    await tx.execute(sql`
      update campaigns set status = 'paused', error = ${reason}
      where status = 'sending'
        and workspace_id in (select workspace_id from memberships where user_id = ${userId} and role like '%owner%')`);
  });
  return reason;
}

/** The owners of workspaces that sent in the last week: who enforceAccountHealth looks at. */
export async function recentlySendingAccounts() {
  const rows = await getDb().execute<{ user_id: string }>(sql`
    select distinct mb.user_id from memberships mb
    where mb.role like '%owner%'
      and exists (select 1 from messages m
                  where m.workspace_id = mb.workspace_id
                    and m.sent_at >= now() - make_interval(days => ${ACCOUNT_HEALTH.days}::int))`);
  return rows.map((r) => r.user_id);
}
