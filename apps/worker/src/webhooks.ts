import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { signConversionBody } from "@sendcoop/db";

// Calling the user's webhooks (automation actions D67, events D78). They
// point anywhere, so a webhook may not reach our own network (SSRF):
// private, loopback and link-local addresses are refused, after resolving
// the name, and redirects aren't followed. Bodies are signed like requests
// to our API: Sendcoop-Timestamp, and Sendcoop-Signature = sha256=HMAC of
// "<timestamp>.<body>" with the workspace's webhook secret.

const PRIVATE_V4: [number, number][] = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10 (carrier NAT)
  [0x7f000000, 8], // 127/8
  [0xa9fe0000, 16], // 169.254/16 (link-local, cloud metadata)
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // 192.0.0/24
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // 198.18/15
  [0xe0000000, 3], // 224/3: multicast and reserved
];

export function isPrivateAddress(address: string): boolean {
  const mapped = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(mapped) === 4) {
    const n = mapped.split(".").reduce((a, p) => (a << 8) + Number(p), 0) >>> 0;
    return PRIVATE_V4.some(([base, bits]) => (n & ((~0 << (32 - bits)) >>> 0)) >>> 0 === base);
  }
  if (isIP(mapped) === 6) {
    return (
      mapped === "::" ||
      mapped === "::1" ||
      /^f[cd]/.test(mapped) || // unique local fc00::/7
      /^fe[89ab]/.test(mapped) // link-local fe80::/10
    );
  }
  return true;
}

/** Why a webhook URL can't be called, or null. */
export async function webhookUrlProblem(raw: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Not a URL.";
  }
  // Tests call a local server; never set outside them.
  const allowLocal = process.env.SENDCOOP_ALLOW_PRIVATE_WEBHOOKS === "1";
  if (url.protocol !== "https:" && !(allowLocal && url.protocol === "http:")) {
    return "Webhooks go to https:// addresses.";
  }
  if (allowLocal) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : await lookup(host, { all: true })
        .then((r) => r.map((a) => a.address))
        .catch(() => []);
  if (addresses.length === 0) return "The address doesn't resolve.";
  if (addresses.some(isPrivateAddress))
    return "Webhooks can't go to private or internal addresses.";
  return null;
}

export type WebhookOutcome = {
  ok: boolean;
  status: number | null;
  error: string | null;
  attempts: number;
};

/** POSTs a signed JSON body; two quick retries on a network error or a 5xx/429. */
export async function deliverWebhook(
  url: string,
  body: Record<string, unknown>,
  secret: string,
  { attempts = 3, wait = (ms: number) => new Promise((r) => setTimeout(r, ms)) } = {},
): Promise<WebhookOutcome> {
  const problem = await webhookUrlProblem(url);
  if (problem) return { ok: false, status: null, error: problem, attempts: 0 };
  const text = JSON.stringify(body);
  let last: WebhookOutcome = { ok: false, status: null, error: null, attempts: 0 };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "content-type": "application/json",
          "user-agent": "Sendcoop-Webhooks/1.0",
          "sendcoop-timestamp": timestamp,
          "sendcoop-signature": signConversionBody(secret, timestamp, text),
        },
        body: text,
      });
      await response.body?.cancel();
      last = { ok: response.ok, status: response.status, error: null, attempts: attempt };
      if (response.ok) return last;
      if (response.status < 500 && response.status !== 429) return last;
    } catch (error) {
      last = {
        ok: false,
        status: null,
        error: error instanceof Error ? error.message : "network error",
        attempts: attempt,
      };
    }
    if (attempt < attempts) await wait(1000 * 3 ** (attempt - 1));
  }
  return last;
}
