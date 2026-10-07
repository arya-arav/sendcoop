import { and, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../client";
import { campaigns, messages, subscribers } from "../schema";

// Bounces and complaints reported by the sending provider (Amazon SES via
// SNS). A hard bounce or a complaint takes the address off every list in the
// workspace: mailing it again hurts the sender's reputation.

export type DeliveryFeedback = {
  kind: "bounce" | "complaint";
  /** Bounces only: permanent (the address doesn't exist) or temporary. */
  hard?: boolean;
  /** The addresses the feedback is about. */
  recipients: string[];
  /** The provider's id for the message, e.g. the SES MessageId. */
  providerMessageId?: string;
  /** Our id, from the X-Sendcoop-Message header when the provider passes headers on. */
  messageId?: string;
  detail?: string;
};

/**
 * Records feedback against the messages it names, only among those sent
 * through `serverId` (the webhook it came in on). Returns how many matched.
 */
export async function recordFeedback(serverId: string, feedback: DeliveryFeedback) {
  const ids = [
    feedback.messageId && z.uuid().safeParse(feedback.messageId).success
      ? eq(messages.id, feedback.messageId)
      : undefined,
    feedback.providerMessageId
      ? eq(messages.providerMessageId, feedback.providerMessageId)
      : undefined,
  ].filter(Boolean);
  const recipients = feedback.recipients.map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (ids.length === 0 || recipients.length === 0) return 0;

  return getDb().transaction(async (tx) => {
    const matched = await tx
      .select({
        id: messages.id,
        subscriberId: messages.subscriberId,
        workspaceId: messages.workspaceId,
      })
      .from(messages)
      .innerJoin(campaigns, eq(campaigns.id, messages.campaignId))
      .where(
        and(
          eq(campaigns.sendingServerId, serverId),
          or(...ids),
          inArray(sql`lower(${messages.email})`, recipients),
        ),
      );

    for (const message of matched) {
      const detail = feedback.detail?.slice(0, 500) ?? null;
      if (feedback.kind === "bounce") {
        await tx
          .update(messages)
          .set({
            bouncedAt: sql`coalesce(${messages.bouncedAt}, now())`,
            // A soft bounce never downgrades a hard one.
            bounceType: feedback.hard ? "hard" : sql`coalesce(${messages.bounceType}, 'soft')`,
            bounceDetail: detail,
          })
          .where(eq(messages.id, message.id));
      } else {
        await tx
          .update(messages)
          .set({ complainedAt: sql`coalesce(${messages.complainedAt}, now())` })
          .where(and(eq(messages.id, message.id), isNull(messages.complainedAt)));
      }

      const suppress =
        feedback.kind === "complaint" ? "complained" : feedback.hard ? "bounced" : null;
      if (suppress && message.subscriberId) {
        await tx
          .update(subscribers)
          .set({ status: suppress, updatedAt: new Date() })
          .where(
            and(
              eq(subscribers.id, message.subscriberId),
              eq(subscribers.workspaceId, message.workspaceId),
              // A complaint outranks a bounce; neither is undone by the other.
              notInArray(
                subscribers.status,
                suppress === "complained" ? ["complained"] : ["bounced", "complained"],
              ),
            ),
          );
      }
    }
    return matched.length;
  });
}
