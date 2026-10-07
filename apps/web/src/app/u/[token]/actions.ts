"use server";

import { readUnsubscribeToken, resubscribeByMessage, unsubscribeByMessage } from "@sendcoop/db";

// The signed token is the credential: whoever has the email can change this.

export async function unsubscribeAction(token: string) {
  const messageId = readUnsubscribeToken(token);
  return { ok: messageId !== null && (await unsubscribeByMessage(messageId)) };
}

export async function resubscribeAction(token: string) {
  const messageId = readUnsubscribeToken(token);
  return { ok: messageId !== null && (await resubscribeByMessage(messageId)) };
}
