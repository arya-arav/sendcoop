import { and, asc, count, desc, eq, exists, gt, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "../client";
import type { FieldValue } from "../custom-fields";
import {
  listMemberships,
  lists,
  type Subscriber,
  type SubscriberSource,
  type SubscriberStatus,
  subscribers,
} from "../schema";
import { isUniqueViolation } from "./errors";

// Every query is scoped by workspaceId. list_memberships has no workspace
// column, so writes check that each list belongs to the subscriber's workspace.

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export type SubscriberInput = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  status?: SubscriberStatus;
  source?: SubscriberSource;
  /** Custom field values, already validated with parseFieldValues. */
  fields?: Record<string, FieldValue>;
};

export type CreateSubscriberResult =
  { ok: true; subscriber: Subscriber } | { ok: false; error: "duplicate" | "invalid_list" };

export async function createSubscriber(
  workspaceId: string,
  input: SubscriberInput,
  listIds: string[] = [],
): Promise<CreateSubscriberResult> {
  const uniqueListIds = [...new Set(listIds)];
  try {
    return await getDb().transaction(async (tx) => {
      if (uniqueListIds.length > 0) {
        const owned = await tx
          .select({ id: lists.id })
          .from(lists)
          .where(and(eq(lists.workspaceId, workspaceId), inArray(lists.id, uniqueListIds)));
        if (owned.length !== uniqueListIds.length) return { ok: false, error: "invalid_list" };
      }

      const status = input.status ?? "subscribed";
      const [subscriber] = await tx
        .insert(subscribers)
        .values({
          workspaceId,
          email: normalizeEmail(input.email),
          firstName: input.firstName,
          lastName: input.lastName,
          status,
          source: input.source ?? "manual",
          fields: input.fields ?? {},
          subscribedAt: status === "subscribed" ? new Date() : null,
        })
        .returning();

      if (uniqueListIds.length > 0) {
        await tx
          .insert(listMemberships)
          .values(uniqueListIds.map((listId) => ({ listId, subscriberId: subscriber!.id })));
      }
      return { ok: true, subscriber: subscriber! };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate" };
    throw error;
  }
}

export type SubscriberRow = Subscriber & { lists: { id: string; name: string }[] };

// Must match the expression in migration 0005_subscriber_search exactly,
// or Postgres can't use the trigram index.
const searchText = sql`lower(${subscribers.email} || ' ' || coalesce(${subscribers.firstName}, '') || ' ' || coalesce(${subscribers.lastName}, ''))`;

export type SubscriberFilters = {
  /** Matches anywhere in email, first or last name, ignoring case. */
  query?: string;
  status?: SubscriberStatus;
  listId?: string;
};

export type SubscriberPage = {
  rows: SubscriberRow[];
  /** Pass as `after` for the next (older) page. */
  nextCursor: string | null;
  /** Pass as `before` for the previous (newer) page. */
  prevCursor: string | null;
  /** Subscribers matching the filters, across all pages. */
  total: number;
};

/**
 * Newest-first subscribers with search, filters and keyset paging. Cursors are
 * subscriber ids (uuidv7, so time-ordered): every page costs the same, unlike
 * OFFSET, which slows down the deeper you go.
 */
export async function searchSubscribers(
  workspaceId: string,
  {
    filters = {},
    after,
    before,
    limit = 50,
  }: { filters?: SubscriberFilters; after?: string; before?: string; limit?: number } = {},
): Promise<SubscriberPage> {
  const db = getDb();
  const where = and(
    eq(subscribers.workspaceId, workspaceId),
    filters.status ? eq(subscribers.status, filters.status) : undefined,
    filters.query?.trim()
      ? sql`${searchText} like ${"%" + escapeLike(filters.query.trim().toLowerCase()) + "%"}`
      : undefined,
    filters.listId
      ? exists(
          db
            .select({ one: sql`1` })
            .from(listMemberships)
            .where(
              and(
                eq(listMemberships.subscriberId, subscribers.id),
                eq(listMemberships.listId, filters.listId),
              ),
            ),
        )
      : undefined,
  );

  // Fetch one extra row to know whether another page exists in that direction.
  const goingBack = Boolean(before) && !after;
  const fetched = await db
    .select()
    .from(subscribers)
    .where(
      and(
        where,
        after ? lt(subscribers.id, after) : undefined,
        goingBack ? gt(subscribers.id, before!) : undefined,
      ),
    )
    .orderBy(goingBack ? asc(subscribers.id) : desc(subscribers.id))
    .limit(limit + 1);

  const hasMore = fetched.length > limit;
  const page = fetched.slice(0, limit);
  if (goingBack) page.reverse();

  const [counted] = await db.select({ total: count() }).from(subscribers).where(where);
  const rows = await withLists(page);
  const first = rows[0]?.id ?? null;
  const last = rows.at(-1)?.id ?? null;

  return {
    rows,
    nextCursor: (goingBack ? true : hasMore) ? last : null,
    prevCursor: (goingBack ? hasMore : Boolean(after)) ? first : null,
    total: counted?.total ?? 0,
  };
}

/** Newest subscribers first, each with the lists they belong to. */
export async function listSubscribers(
  workspaceId: string,
  { limit = 50 }: { limit?: number } = {},
): Promise<SubscriberRow[]> {
  return (await searchSubscribers(workspaceId, { limit })).rows;
}

/** Attaches list names, fetching memberships for this page only. */
async function withLists(page: Subscriber[]): Promise<SubscriberRow[]> {
  if (page.length === 0) return [];
  const memberships = await getDb()
    .select({ subscriberId: listMemberships.subscriberId, id: lists.id, name: lists.name })
    .from(listMemberships)
    .innerJoin(lists, eq(lists.id, listMemberships.listId))
    .where(
      inArray(
        listMemberships.subscriberId,
        page.map((s) => s.id),
      ),
    )
    .orderBy(lists.name);

  const listsBySubscriber = Map.groupBy(memberships, (m) => m.subscriberId);
  return page.map((s) => ({
    ...s,
    lists: (listsBySubscriber.get(s.id) ?? []).map(({ id, name }) => ({ id, name })),
  }));
}

/** Makes % and _ in user input match literally in LIKE patterns. */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => "\\" + c);
}

export async function countSubscribers(workspaceId: string) {
  const [row] = await getDb()
    .select({ total: count() })
    .from(subscribers)
    .where(eq(subscribers.workspaceId, workspaceId));
  return row?.total ?? 0;
}
