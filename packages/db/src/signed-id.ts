import { createHmac, timingSafeEqual } from "node:crypto";

// Short signed tokens that carry one UUID, for links and webhook URLs that
// must work without a login. Signed with a key derived from the app secret
// and a purpose, so a token for one thing can't be used for another. They
// don't expire.

function key(purpose: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`sendcoop:${purpose}`).digest();
}

// 128 bits of HMAC is plenty and keeps the links short.
const sign = (purpose: string, id: Buffer) =>
  createHmac("sha256", key(purpose)).update(id).digest().subarray(0, 16);

export function signId(purpose: string, uuid: string): string {
  const id = Buffer.from(uuid.replaceAll("-", ""), "hex");
  return `${id.toString("base64url")}.${sign(purpose, id).toString("base64url")}`;
}

/** The UUID, or null if the token is malformed, tampered with or for another purpose. */
export function readSignedId(purpose: string, token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const id = Buffer.from(parts[0]!, "base64url");
  if (id.length !== 16) return null;
  const given = Buffer.from(parts[1]!, "base64url");
  const expected = sign(purpose, id);
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

/** Like signId, for several UUIDs in one token (e.g. a message and a link). */
export function signIds(purpose: string, uuids: string[]): string {
  const ids = Buffer.concat(uuids.map((u) => Buffer.from(u.replaceAll("-", ""), "hex")));
  return `${ids.toString("base64url")}.${sign(purpose, ids).toString("base64url")}`;
}

/** The UUIDs (exactly `count` of them), or null if the token isn't valid. */
export function readSignedIds(purpose: string, token: string, count: number): string[] | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const ids = Buffer.from(parts[0]!, "base64url");
  if (ids.length !== 16 * count) return null;
  const given = Buffer.from(parts[1]!, "base64url");
  const expected = sign(purpose, ids);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Array.from({ length: count }, (_, i) => {
    const hex = ids.subarray(i * 16, i * 16 + 16).toString("hex");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  });
}
