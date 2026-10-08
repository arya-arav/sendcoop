import { getConnInfo } from "@hono/node-server/conninfo";
import {
  decorateDestination,
  pingDatabase,
  readClickToken,
  recordClick,
  type ServiceName,
} from "@sendcoop/db";
import { fillUrlTemplate, mergeValuesFor } from "@sendcoop/mailer/personalize";
import { pingRedis } from "@sendcoop/redis";
import { type Context, Hono } from "hono";

const service: ServiceName = "edge";

// Public, high-traffic endpoints: click redirects (D37), open pixel (D39),
// postbacks (D42). Kept small and fast: a click is one database round trip.
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
