import { getConnInfo } from "@hono/node-server/conninfo";
import {
  decorateDestination,
  findIntegrationBySecret,
  ipAllowed,
  parsePixelEvent,
  parsePostback,
  pingDatabase,
  readClickToken,
  readHoneypotToken,
  readOpenToken,
  recordClick,
  recordConversion,
  recordHoneypot,
  recordOpen,
  type ServiceName,
} from "@sendcoop/db";
import { fillUrlTemplate, mergeValuesFor } from "@sendcoop/mailer/personalize";
import { pingRedis } from "@sendcoop/redis";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { PIXEL_JS } from "./pixel";

const service: ServiceName = "edge";

// Public, high-traffic endpoints: click redirects (D37), open pixel (D39),
// postbacks (D42), the website pixel (D46). Kept small and fast: a click is
// one database round trip.
export const app = new Hono();

app.get("/health", async (c) => {
  const [postgres, redis] = await Promise.all([pingDatabase(), pingRedis()]);
  const ok = postgres && redis;
  return c.json({ service, ok, postgres, redis }, ok ? 200 : 503);
});

/** The visitor's IP: the first X-Forwarded-For hop behind a proxy, else the socket's. */
function clientIp(c: Context) {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null; // not running on a Node socket (tests)
  }
}

const brokenLink = (c: Context) =>
  c.html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Link not found</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#18181b">
<main style="max-width:28rem;padding:1rem;text-align:center"><h1 style="font-size:1.25rem">This link doesn't work</h1>
<p style="color:#71717a">It may have been copied incompletely. Try the link in the email again.</p></main></body></html>`,
    404,
  );

/** A tracked link in a campaign email: record the click, then send the person on. */
app.get("/c/:token", async (c) => {
  const ids = readClickToken(c.req.param("token"));
  if (!ids) return brokenLink(c);
  const click = await recordClick({
    ...ids,
    ip: clientIp(c),
    userAgent: c.req.header("user-agent") ?? null,
  });
  if (!click) return brokenLink(c);

  const url = fillUrlTemplate(click.url, mergeValuesFor(click.subscriber));
  if (!/^https?:\/\//i.test(url)) return brokenLink(c);
  // UTM tags and sc_cid, or the click id in the affiliate network's sub-id.
  const destination = decorateDestination(url, {
    clickId: click.clickId,
    networkId: click.link.networkId,
    campaignName: click.campaignName,
    label: click.link.label,
    position: click.link.position,
    ...click.tracking,
  });
  c.header("cache-control", "no-store");
  return c.redirect(destination, 302);
});

// A 1x1 transparent GIF.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** The open pixel: always answers with the image, whatever happens. */
app.get("/o/:file", async (c) => {
  const messageId = readOpenToken(c.req.param("file"));
  if (messageId) {
    await recordOpen({
      messageId,
      ip: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    }).catch((error: unknown) => console.error("[edge] open not recorded", error));
  }
  return c.body(PIXEL, 200, {
    "content-type": "image/gif",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  });
});

/** The hidden link only machines follow: their recent clicks on that email don't count. */
app.get("/h/:token", async (c) => {
  const messageId = readHoneypotToken(c.req.param("token"));
  if (messageId) await recordHoneypot(messageId);
  return c.body(null, 204);
});

/** All parameters of a request: the query string, plus a form or JSON body. */
async function requestParams(c: Context) {
  const params: Record<string, string> = { ...c.req.query() };
  if (c.req.method === "POST") {
    const type = c.req.header("content-type") ?? "";
    try {
      const body = type.includes("application/json")
        ? ((await c.req.json()) as Record<string, unknown>)
        : await c.req.parseBody();
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === "string" || typeof value === "number") params[key] = String(value);
      }
    } catch {
      // An unreadable body: the query string is all there is.
    }
  }
  return params;
}

/**
 * Server-to-server conversion postbacks from affiliate networks:
 * /pb?key=<postback key>&cid={subid}&payout={payout}&txid={transaction id}
 * (GET or POST). Answers in plain text, as networks expect.
 */
app.on(["GET", "POST"], "/pb", async (c) => {
  const params = await requestParams(c);
  const { key = "", ...rest } = params;
  const integration = await findIntegrationBySecret("postback", key);
  if (!integration) return c.text("unknown postback key", 401);
  const allowed = integration.config.allowedIps;
  if (Array.isArray(allowed) && !ipAllowed(clientIp(c), allowed.map(String))) {
    return c.text("ip not allowed", 403);
  }

  const parsed = parsePostback(rest);
  const { result } = await recordConversion(integration.workspaceId, {
    ...parsed,
    source: "postback",
    payload: rest,
  });
  return c.text(`ok ${result}`);
});

/** The website pixel (see pixel.ts). */
app.get("/sc.js", (c) => {
  c.header("Content-Type", "text/javascript; charset=utf-8");
  c.header("Cache-Control", "public, max-age=3600");
  c.header("Access-Control-Allow-Origin", "*");
  return c.body(PIXEL_JS);
});

/**
 * Conversions from sc.js on a store's pages. Any site may send them (the
 * pixel key is public), so they're only as trustworthy as a browser:
 * refunds and server-side reporting go through postbacks or the API.
 */
app.use("/px", cors({ origin: "*", allowMethods: ["POST"], maxAge: 86_400 }));
app.post("/px", async (c) => {
  let body: unknown;
  try {
    // sendBeacon sends JSON as text/plain, which skips the CORS preflight.
    body = JSON.parse((await c.req.text()).slice(0, 10_000));
  } catch {
    return c.text("invalid json", 400);
  }
  const event = parsePixelEvent(body);
  if (!event) return c.text("missing key", 400);
  const integration = await findIntegrationBySecret("pixel", event.key);
  if (!integration) return c.text("unknown pixel key", 401);

  await recordConversion(integration.workspaceId, {
    clickId: event.clickId,
    email: event.email,
    event: event.event,
    value: event.value,
    currency: event.currency,
    status: event.status,
    txid: event.txid,
    source: "pixel",
    network: null,
    payload: { url: event.url, origin: c.req.header("origin") ?? null },
  });
  return c.body(null, 204);
});
