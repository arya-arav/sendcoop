import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import { adminActivity, users } from "../schema";

export async function recordAdminActivity(entry: {
  adminId: string;
  action: string;
  targetId?: string | null;
  detail?: Record<string, unknown>;
}) {
  await getDb()
    .insert(adminActivity)
    .values({
      adminId: entry.adminId,
      action: entry.action,
      targetId: entry.targetId ?? null,
      detail: entry.detail ?? {},
    });
}

/** Newest first; for one record when targetId is given. */
export async function listAdminActivity({
  targetId,
  limit = 50,
  offset = 0,
}: { targetId?: string; limit?: number; offset?: number } = {}) {
  return getDb()
    .select({
      id: adminActivity.id,
      action: adminActivity.action,
      targetId: adminActivity.targetId,
      detail: adminActivity.detail,
      createdAt: adminActivity.createdAt,
      adminEmail: users.email,
      adminName: users.name,
    })
    .from(adminActivity)
    .leftJoin(users, eq(users.id, adminActivity.adminId))
    .where(targetId ? eq(adminActivity.targetId, targetId) : sql`true`)
    .orderBy(desc(adminActivity.createdAt))
    .limit(limit)
    .offset(offset);
}
