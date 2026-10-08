import { getConnInfo } from "@hono/node-server/conninfo";
import {
  addLeadToList,
  decorateDestination,
  findIntegrationBySecret,
  ipAllowed,
  parseApiConversion,
  parseLead,
  parsePixelEvent,
  parsePostback,
  parseShopifyOrder,
  parseShopifyRefund,
  parseWooOrder,
  pingDatabase,
  readClickToken,
  readHoneypotToken,
  readIntegrationSecret,
  readOpenToken,
  recordClick,
  recordConversion,
  recordLead,
  recordHoneypot,
  recordOpen,
  refundConversion,
  type ServiceName,
  verifyConversionSignature,
  verifyShopifyHmac,
  verifyWooSignature,
  webhookSigningSecret,
} from "@sendcoop/db";
import { fillUrlTemplate, mergeValuesFor } from "@sendcoop/mailer/personalize";
import { pingRedis } from "@sendcoop/redis";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { PIXEL_JS } from "./pixel";

const service: ServiceName = "edge";

// Public, high-traffic endpoints: click redirects (D37), open pixel (D39),
// postbacks (D42), the website pixel (D46), the conversion API (D47), Shopify
// (D48), WooCommerce (D49), leads (D50). Kept small and fast: a click is one database round trip.
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
    audience: click.audience,
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

const apiError = (c: Context, status: 400 | 401 | 413 | 422, error: string) =>
  c.json({ error }, status);

/**
 * The server-side conversion API, for stores and apps reporting sales from
 * their own servers (see conversion-api.ts for the signature).
 */
app.post("/v1/conversions", async (c) => {
  const workspaceId = c.req.header("sendcoop-workspace")?.trim() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) {
    return apiError(c, 401, "Send your workspace id in the Sendcoop-Workspace header.");
  }
  const body = await c.req.text();
  if (body.length > 20_000) return apiError(c, 413, "The body is too large.");
  const secret = await readIntegrationSecret(workspaceId, "api");
  const verdict = secret
    ? verifyConversionSignature({
        secret,
        timestamp: c.req.header("sendcoop-timestamp"),
        signature: c.req.header("sendcoop-signature"),
        body,
      })
    : "invalid";
  if (verdict === "missing") {
    return apiError(c, 401, "Sign the request: Sendcoop-Timestamp and Sendcoop-Signature headers.");
  }
  if (verdict === "expired") {
    return apiError(
      c,
      401,
      "Sendcoop-Timestamp is more than 5 minutes off: sign each request anew.",
    );
  }
  if (verdict !== "ok") {
    return apiError(
      c,
      401,
      "The signature doesn't match. Sign '<timestamp>.<body>' with your API secret.",
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return apiError(c, 400, "The body isn't valid JSON.");
  }
  const parsed = parseApiConversion(json);
  if (!parsed.ok) return apiError(c, 422, parsed.error);
  const recorded = await recordConversion(workspaceId, {
    ...parsed.conversion,
    source: "api",
    network: null,
    payload: json as Record<string, unknown>,
  });
  return c.json(
    { result: recorded.result, id: recorded.id, attributed_by: recorded.method ?? null },
    recorded.result === "created" ? 201 : 200,
  );
});

/**
 * Shopify order webhooks (see shopify.ts). The URL's key says which
 * workspace; Shopify's signature, with the secret from its admin, proves
 * the body is Shopify's.
 */
app.post("/wh/shopify/:key", async (c) => {
  const integration = await findIntegrationBySecret("shopify", c.req.param("key"));
  if (!integration) return c.text("unknown webhook url", 404);
  const secret = webhookSigningSecret(integration.config);
  if (!secret) return c.text("add the webhook signing secret in Sendcoop first", 401);
  const body = await c.req.text();
  if (!verifyShopifyHmac(secret, body, c.req.header("x-shopify-hmac-sha256"))) {
    return c.text("invalid signature", 401);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return c.text("invalid json", 400);
  }

  const topic = c.req.header("x-shopify-topic");
  if (topic === "orders/create" || topic === "orders/paid") {
    const order = parseShopifyOrder(payload);
    if (!order) return c.text("not an order", 422);
    const { result } = await recordConversion(integration.workspaceId, {
      ...order,
      source: "shopify",
      event: "sale",
      network: null,
      payload: {
        order: (payload as { name?: unknown }).name ?? null,
        shop: c.req.header("x-shopify-shop-domain") ?? null,
      },
    });
    return c.text(`ok ${result}`);
  }
  if (topic === "refunds/create") {
    const refund = parseShopifyRefund(payload);
    if (!refund) return c.text("not a refund", 422);
    return c.text(`ok ${await refundConversion(integration.workspaceId, refund)}`);
  }
  // Other topics: accepted, so Shopify doesn't retry them, and ignored.
  return c.text("ok ignored");
});

/**
 * Leads from form tools and CRMs (see lead-params.ts): JSON or form fields.
 * New leads can join a list; the same lead id later moves the lead along.
 */
app.post("/lead/:key", async (c) => {
  const integration = await findIntegrationBySecret("leads", c.req.param("key"));
  if (!integration) return c.json({ error: "Unknown lead webhook URL." }, 404);
  const params = await requestParams(c);
  const parsed = parseLead(params);
  if (!parsed.ok) return c.json({ error: parsed.error }, 422);
  const { lead } = parsed;
  const recorded = await recordLead(integration.workspaceId, lead, params);
  const listId = integration.config.listId;
  const listed =
    recorded.result === "created" && typeof listId === "string"
      ? await addLeadToList(integration.workspaceId, listId, lead)
      : false;
  return c.json(
    {
      result: recorded.result,
      stage: recorded.stage,
      attributed_by: recorded.method ?? null,
      listed,
    },
    recorded.result === "created" ? 201 : 200,
  );
});

/** WooCommerce order webhooks (see woocommerce.ts). */
app.post("/wh/woocommerce/:key", async (c) => {
  const integration = await findIntegrationBySecret("woocommerce", c.req.param("key"));
  if (!integration) return c.text("unknown webhook url", 404);
  const body = await c.req.text();
  // Saving a webhook in WooCommerce sends "webhook_id=<id>" to check the URL.
  if (/^webhook_id=\d+$/.test(body.trim())) return c.text("ok ping");
  const secret = webhookSigningSecret(integration.config);
  if (!secret || !verifyWooSignature(secret, body, c.req.header("x-wc-webhook-signature"))) {
    return c.text("invalid signature", 401);
  }
  const topic = c.req.header("x-wc-webhook-topic");
  if (topic !== "order.created" && topic !== "order.updated") return c.text("ok ignored");
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return c.text("invalid json", 400);
  }
  const order = parseWooOrder(payload, c.req.header("x-wc-webhook-source") ?? null);
  if (!order) return c.text("not an order", 422);

  const { refunds, ...conversion } = order;
  const { result } = await recordConversion(integration.workspaceId, {
    ...conversion,
    source: "woocommerce",
    event: "sale",
    network: null,
    payload: { order: (payload as { number?: unknown }).number ?? null },
  });
  for (const refund of refunds) {
    await refundConversion(integration.workspaceId, { txid: order.txid, ...refund });
  }
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
