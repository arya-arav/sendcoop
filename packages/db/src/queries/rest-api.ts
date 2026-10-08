import { and, desc, eq, inArray, lt, type SQL, sql } from "drizzle-orm";
import { getDb } from "../client";
import type { FieldValue } from "../custom-fields";
import { conversions, listMemberships, lists, subscribers } from "../schema";

// Reads and writes behind the REST API (D77). Pages run newest first by id
// (uuidv7 ids are time-ordered); the cursor is the last id of a page.

const subscriberColumns = {
  id: subscribers.id,
  email: subscribers.email,
  firstName: subscribers.firstName,
  lastName: subscribers.lastName,
  status: subscribers.status,
  source: subscribers.source,
  fields: subscribers.fields,
  timezone: subscribers.timezone,
  subscribedAt: subscribers.subscribedAt,
  unsubscribedAt: subscribers.unsubscribedAt,
  createdAt: subscribers.createdAt,
  updatedAt: subscribers.updatedAt,
};

export type ApiSubscriber = Awaited<ReturnType<typeof apiListSubscribers>>["rows"][number];

async function withLists<T extends { id: string }>(rows: T[]) {
  if (rows.length === 0) return [];
  const memberships = await getDb()
    .select({ subscriberId: listMemberships.subscriberId, listId: listMemberships.listId })
    .from(listMemberships)
    .where(
      inArray(
        listMemberships.subscriberId,
        rows.map((r) => r.id),
      ),
    );
  return rows.map((r) => ({
    ...r,
    lists: memberships.filter((m) => m.subscriberId === r.id).map((m) => m.listId),
  }));
}

export async function apiListSubscribers(
  workspaceId: string,
  opts: { limit: number; cursor: string | null; status?: string | null; listId?: string | null },
) {
  const where: (SQL | undefined)[] = [eq(subscribers.workspaceId, workspaceId)];
  if (opts.cursor) where.push(lt(subscribers.id, opts.cursor));
  if (opts.status) where.push(sql`${subscribers.status}::text = ${opts.status}`);
  if (opts.listId) {
    where.push(sql`exists (select 1 from ${listMemberships}
      where ${listMemberships.subscriberId} = ${subscribers.id} and ${listMemberships.listId} = ${opts.listId})`);
  }
  const rows = await getDb()
    .select(subscriberColumns)
    .from(subscribers)
    .where(and(...where))
    .orderBy(desc(subscribers.id))
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  return {
    rows: await withLists(page),
    nextCursor: rows.length > opts.limit ? page.at(-1)!.id : null,
  };
}

/** By id, or by email address. */
export async function apiGetSubscriber(workspaceId: string, idOrEmail: string) {
  const byId = /^[0-9a-f-]{36}$/i.test(idOrEmail);
  const [row] = await getDb()
    .select(subscriberColumns)
    .from(subscribers)
    .where(
      and(
        eq(subscribers.workspaceId, workspaceId),
        byId
          ? eq(subscribers.id, idOrEmail)
          : eq(subscribers.email, idOrEmail.trim().toLowerCase()),
      ),
    );
  return row ? (await withLists([row]))[0]! : null;
}

/** The ids among `listIds` that are this workspace's lists. */
export async function ownListIds(workspaceId: string, listIds: string[]) {
  const ids = [...new Set(listIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (ids.length === 0) return [];
  const rows = await getDb()
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.workspaceId, workspaceId), inArray(lists.id, ids)));
  return rows.map((r) => r.id);
}

export type ApiSubscriberChanges = {
  firstName?: string | null;
  lastName?: string | null;
  /** Merged into the existing values. */
  fields?: Record<string, FieldValue>;
  unsubscribe?: boolean;
  addLists?: string[];
  removeLists?: string[];
};

export async function apiUpdateSubscriber(
  workspaceId: string,
  subscriberId: string,
  changes: ApiSubscriberChanges,
) {
  return getDb().transaction(async (tx) => {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (changes.firstName !== undefined) set.firstName = changes.firstName;
    if (changes.lastName !== undefined) set.lastName = changes.lastName;
    if (changes.fields) {
      set.fields = sql`${subscribers.fields} || ${JSON.stringify(changes.fields)}::jsonb`;
    }
    if (changes.unsubscribe) {
      set.status = "unsubscribed";
      set.unsubscribedAt = sql`coalesce(${subscribers.unsubscribedAt}, now())`;
    }
    const updated = await tx
      .update(subscribers)
      .set(set)
      .where(and(eq(subscribers.workspaceId, workspaceId), eq(subscribers.id, subscriberId)))
      .returning({ id: subscribers.id });
    if (updated.length === 0) return false;
    if (changes.addLists?.length) {
      await tx
        .insert(listMemberships)
        .values(changes.addLists.map((listId) => ({ listId, subscriberId })))
        .onConflictDoNothing();
    }
    if (changes.removeLists?.length) {
      await tx
        .delete(listMemberships)
        .where(
          and(
            eq(listMemberships.subscriberId, subscriberId),
            inArray(listMemberships.listId, changes.removeLists),
          ),
        );
    }
    return true;
  });
}

export async function apiDeleteSubscriber(workspaceId: string, subscriberId: string) {
  const rows = await getDb()
    .delete(subscribers)
    .where(and(eq(subscribers.workspaceId, workspaceId), eq(subscribers.id, subscriberId)))
    .returning({ id: subscribers.id });
  return rows.length > 0;
}

export async function apiListConversions(
  workspaceId: string,
  opts: { limit: number; cursor: string | null },
) {
  const rows = await getDb()
    .select({
      id: conversions.id,
      event: conversions.event,
      status: conversions.status,
      value: conversions.value,
      currency: conversions.currency,
      valueBase: conversions.valueBase,
      source: conversions.source,
      clickId: conversions.clickId,
      externalTxid: conversions.externalTxid,
      campaignId: conversions.campaignId,
      automationId: conversions.automationId,
      subscriberId: conversions.subscriberId,
      createdAt: conversions.createdAt,
    })
    .from(conversions)
    .where(
      and(
        eq(conversions.workspaceId, workspaceId),
        opts.cursor ? lt(conversions.id, opts.cursor) : undefined,
      ),
    )
    .orderBy(desc(conversions.id))
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  return { rows: page, nextCursor: rows.length > opts.limit ? page.at(-1)!.id : null };
}
