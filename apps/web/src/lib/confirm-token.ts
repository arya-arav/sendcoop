import { createHmac, timingSafeEqual } from "node:crypto";

// Signed links for double opt-in. Nothing is stored: the token carries who and
// which form, with an expiry, signed with a key derived from the app secret.

const LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export type ConfirmClaims = { subscriberId: string; workspaceId: string; formId: string };

function key() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  // Separate key per purpose, so these tokens can't be confused with anything else.
  return createHmac("sha256", secret).update("sendcoop:confirm-subscription").digest();
}

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export function createConfirmToken(claims: ConfirmClaims, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({
      s: claims.subscriberId,
      w: claims.workspaceId,
      f: claims.formId,
      e: now + LIFETIME_MS,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The claims, or null if the token is malformed, tampered with or expired. */
export function readConfirmToken(token: string, now = Date.now()): ConfirmClaims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.e !== "number" || data.e < now) return null;
    if (![data.s, data.w, data.f].every((v) => typeof v === "string")) return null;
    return { subscriberId: data.s, workspaceId: data.w, formId: data.f };
  } catch {
    return null;
  }
}
