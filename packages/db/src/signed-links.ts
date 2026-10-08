import { readSignedId, readSignedIds, signId, signIds } from "./signed-id";

// Signed links: unsubscribe links in campaign emails (the token names the
// message, and so the campaign and the subscriber) and webhook URLs.
// Unsubscribe links never expire: a link in an old email must keep working.

export const createUnsubscribeToken = (messageId: string) => signId("unsubscribe", messageId);

/** The message id, or null if the token is malformed or tampered with. */
export const readUnsubscribeToken = (token: string) => readSignedId("unsubscribe", token);

/**
 * The two links for a message: the page people reach from the link in the
 * email, and the RFC 8058 one-click endpoint mail providers POST to.
 */
export function unsubscribeUrls(
  messageId: string,
  baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
) {
  const token = createUnsubscribeToken(messageId);
  const base = baseUrl.replace(/\/$/, "");
  return { page: `${base}/u/${token}`, oneClick: `${base}/api/unsubscribe/${token}` };
}

/** Where Amazon SNS posts a sending server's bounce and complaint notifications. */
export function sesWebhookUrl(
  serverId: string,
  baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
) {
  return `${baseUrl.replace(/\/$/, "")}/api/webhooks/ses/${signId("ses-webhook", serverId)}`;
}

/** The sending server id, or null if the token isn't valid. */
export const readSesWebhookToken = (token: string) => readSignedId("ses-webhook", token);

/** Tracked link: which message (so: subscriber and campaign) and which link. */
export const createClickToken = (messageId: string, linkId: string) =>
  signIds("click", [messageId, linkId]);

export function readClickToken(token: string) {
  const ids = readSignedIds("click", token, 2);
  return ids ? { messageId: ids[0]!, linkId: ids[1]! } : null;
}

/** The tracked URL for a link in one recipient's email (served by the edge app). */
export function clickUrl(
  messageId: string,
  linkId: string,
  baseUrl = process.env.TRACKING_URL ?? "http://localhost:3001",
) {
  return `${baseUrl.replace(/\/$/, "")}/c/${createClickToken(messageId, linkId)}`;
}
