import { createHmac, timingSafeEqual } from "node:crypto";

// UTMCAP signs webhook bodies: UTMCAP-Signature: t=<unix seconds>,v1=<hex
// HMAC-SHA256 of "<t>.<raw body>" with the endpoint's whsec_ secret>.
// Requests more than five minutes off are refused.

export const UTMCAP_SIGNATURE_TOLERANCE_SECONDS = 300;

export function signUtmcapBody(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

export function verifyUtmcapSignature(
  secret: string,
  body: string,
  header: string | undefined | null,
  now = Date.now(),
): "ok" | "missing" | "expired" | "invalid" {
  if (!header) return "missing";
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return "invalid";
  if (Math.abs(now / 1000 - t) > UTMCAP_SIGNATURE_TOLERANCE_SECONDS) return "expired";
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest();
  const given = Buffer.from(/^[0-9a-f]+$/i.test(parts.v1) ? parts.v1 : "", "hex");
  return given.length === expected.length && timingSafeEqual(given, expected) ? "ok" : "invalid";
}
