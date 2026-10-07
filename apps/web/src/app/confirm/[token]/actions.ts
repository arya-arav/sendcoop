"use server";

import { confirmSubscriber } from "@sendcoop/db";
import { readConfirmToken } from "@/lib/confirm-token";

/** Confirms the subscription the signed token names. Safe to repeat. */
export async function confirmSubscriptionAction(token: string) {
  const claims = readConfirmToken(token);
  if (!claims) return { ok: false as const };
  const status = await confirmSubscriber(claims.workspaceId, claims.subscriberId);
  return { ok: status === "subscribed" };
}
