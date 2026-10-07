import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import { messages, subscribers, workspaces } from "../schema";

// Unsubscribing from a link in a campaign email. The message identifies the
// person and the workspace; no login is involved.

export type UnsubscribeTarget = {
  email: string;
  workspaceName: string;
  /** subscribed, unsubscribed, ...; null when the subscriber was deleted. */
  status: string | null;
};

export async function getUnsubscribeTarget(messageId: string): Promise<UnsubscribeTarget | null> {
  const [row] = await getDb()
    .select({
      email: messages.email,
      workspaceName: workspaces.name,
      status: subscribers.status,
    })
    .from(messages)
    .innerJoin(workspaces, eq(workspaces.id, messages.workspaceId))
    .leftJoin(subscribers, eq(subscribers.id, messages.subscriberId))
    .where(eq(messages.id, messageId));
  return row ?? null;
}

/**
 * Unsubscribes the recipient of a message from its workspace and records
 * which email they used. Safe to repeat. False if the message doesn't exist.
 */
export async function unsubscribeByMessage(messageId: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [message] = await tx
      .update(messages)
      .set({ unsubscribedAt: sql`coalesce(${messages.unsubscribedAt}, now())` })
      .where(eq(messages.id, messageId))
      .returning({ subscriberId: messages.subscriberId, workspaceId: messages.workspaceId });
    if (!message) return false;
    if (message.subscriberId) {
      await tx
        .update(subscribers)
        .set({ status: "unsubscribed", unsubscribedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(subscribers.id, message.subscriberId),
            eq(subscribers.workspaceId, message.workspaceId),
            // Bounced and complained addresses stay suppressed as they are.
            inArray(subscribers.status, ["subscribed", "pending"]),
          ),
        );
    }
    return true;
  });
}

/**
 * Undoes an unsubscribe from the same link ("unsubscribed by mistake").
 * Only unsubscribed people come back; bounced or complained ones don't.
 */
export async function resubscribeByMessage(messageId: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [message] = await tx
      .update(messages)
      .set({ unsubscribedAt: null })
      .where(eq(messages.id, messageId))
      .returning({ subscriberId: messages.subscriberId, workspaceId: messages.workspaceId });
    if (!message?.subscriberId) return false;
    const changed = await tx
      .update(subscribers)
      .set({ status: "subscribed", unsubscribedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(subscribers.id, message.subscriberId),
          eq(subscribers.workspaceId, message.workspaceId),
          eq(subscribers.status, "unsubscribed"),
        ),
      )
      .returning({ id: subscribers.id });
    return changed.length > 0;
  });
}
