import { createHmac, timingSafeEqual } from "node:crypto";

// Unsubscribe links in campaign emails. The token names the message (and so
// the campaign and the subscriber), signed with a key derived from the app
// secret. They never expire: a link in an old email must keep working.

function key() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  // Separate key per purpose, so these tokens can't be confused with anything else.
  return createHmac("sha256", secret).update("sendcoop:unsubscribe").digest();
}

// 128 bits of HMAC is plenty and keeps the links short.
const sign = (id: Buffer) => createHmac("sha256", key()).update(id).digest().subarray(0, 16);

export function createUnsubscribeToken(messageId: string): string {
  const id = Buffer.from(messageId.replaceAll("-", ""), "hex");
  return `${id.toString("base64url")}.${sign(id).toString("base64url")}`;
}

/** The message id, or null if the token is malformed or tampered with. */
export function readUnsubscribeToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const id = Buffer.from(parts[0]!, "base64url");
  if (id.length !== 16) return null;
  const given = Buffer.from(parts[1]!, "base64url");
  const expected = sign(id);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const hex = id.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

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
