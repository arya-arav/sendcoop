import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import { getDb } from "../client";
import { listMemberships, subscribers, subscriberTags } from "../schema";
import { type SubscriberFilters, subscriberConditions } from "./subscribers";

/**
 * Which subscribers a bulk action applies to: specific ids (checked rows), or
 * everyone matching the Contacts page filters ("select all N matching").
 * Either way it's limited to the workspace.
 */
export type SubscriberSelection = { ids: string[] } | { filters: SubscriberFilters };

export const MAX_SELECTED_IDS = 500;

function selected(workspaceId: string, selection: SubscriberSelection): SQL {
  return "ids" in selection
    ? and(eq(subscribers.workspaceId, workspaceId), inArray(subscribers.id, selection.ids))!
    : subscriberConditions(workspaceId, selection.filters);
}

// Each action is one statement over the selection, so "all 100,000 matching"
// costs the same round trips as one row. Returns how many subscribers changed.
// Tag and list ids must already be checked to belong to the workspace.

export async function bulkAddTag(
  workspaceId: string,
  selection: SubscriberSelection,
  tagId: string,
) {
  const result = await getDb().execute(sql`
    insert into ${subscriberTags} (tag_id, subscriber_id)
    select ${tagId}, ${subscribers.id} from ${subscribers}
    where ${selected(workspaceId, selection)}
    on conflict do nothing`);
  return result.count;
}

export async function bulkRemoveTag(
  workspaceId: string,
  selection: SubscriberSelection,
  tagId: string,
) {
  const result = await getDb().execute(sql`
    delete from ${subscriberTags}
    where ${subscriberTags.tagId} = ${tagId}
      and ${subscriberTags.subscriberId} in (
        select ${subscribers.id} from ${subscribers} where ${selected(workspaceId, selection)}
      )`);
  return result.count;
}

export async function bulkAddToList(
  workspaceId: string,
  selection: SubscriberSelection,
  listId: string,
) {
  const result = await getDb().execute(sql`
    insert into ${listMemberships} (list_id, subscriber_id)
    select ${listId}, ${subscribers.id} from ${subscribers}
    where ${selected(workspaceId, selection)}
    on conflict do nothing`);
  return result.count;
}

export async function bulkRemoveFromList(
  workspaceId: string,
  selection: SubscriberSelection,
  listId: string,
) {
  const result = await getDb().execute(sql`
    delete from ${listMemberships}
    where ${listMemberships.listId} = ${listId}
      and ${listMemberships.subscriberId} in (
        select ${subscribers.id} from ${subscribers} where ${selected(workspaceId, selection)}
      )`);
  return result.count;
}

/**
 * Moves the selection from one list to another in one transaction. Returns how
 * many were taken off the source list (everyone selected ends up on the target).
 */
export async function bulkMoveToList(
  workspaceId: string,
  selection: SubscriberSelection,
  { from, to }: { from: string; to: string },
) {
  return getDb().transaction(async (tx) => {
    // Adding to the target first leaves membership of the source list untouched,
    // so a selection filtered by the source list still matches the same people
    // when they're removed from it.
    const where = selected(workspaceId, selection);
    await tx.execute(sql`
      insert into ${listMemberships} (list_id, subscriber_id)
      select ${to}, ${subscribers.id} from ${subscribers} where ${where}
      on conflict do nothing`);
    const removed = await tx.execute(sql`
      delete from ${listMemberships}
      where ${listMemberships.listId} = ${from}
        and ${listMemberships.subscriberId} in (
          select ${subscribers.id} from ${subscribers} where ${where}
        )`);
    return removed.count;
  });
}

/** Unsubscribes subscribed and pending people; bounced and complained stay as they are. */
export async function bulkUnsubscribe(workspaceId: string, selection: SubscriberSelection) {
  const result = await getDb().execute(sql`
    update ${subscribers}
    set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
    where ${selected(workspaceId, selection)}
      and ${subscribers.status} in ('subscribed', 'pending')`);
  return result.count;
}

/** Permanently deletes subscribers, with their list and tag memberships. */
export async function bulkDelete(workspaceId: string, selection: SubscriberSelection) {
  const result = await getDb().execute(sql`
    delete from ${subscribers} where ${selected(workspaceId, selection)}`);
  return result.count;
}
