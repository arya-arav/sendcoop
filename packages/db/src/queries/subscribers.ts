import { and, count, desc, eq, inArray } from "drizzle-orm";
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

/** Newest subscribers first, each with the lists they belong to. */
export async function listSubscribers(
  workspaceId: string,
  { limit = 50 }: { limit?: number } = {},
): Promise<SubscriberRow[]> {
  const db = getDb();
  const page = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.workspaceId, workspaceId))
    .orderBy(desc(subscribers.id))
    .limit(limit);
  if (page.length === 0) return [];

  // Lists for this page only, rather than aggregating every membership.
  const memberships = await db
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

export async function countSubscribers(workspaceId: string) {
  const [row] = await getDb()
    .select({ total: count() })
    .from(subscribers)
    .where(eq(subscribers.workspaceId, workspaceId));
  return row?.total ?? 0;
}
