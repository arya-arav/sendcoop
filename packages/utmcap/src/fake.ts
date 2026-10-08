import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { UtmcapCampaign, UtmcapTrafficSource } from "./client";
import { signUtmcapBody } from "./signature";

// A stand-in for UTMCAP, for tests: the API endpoints Sendcoop calls (same
// shapes as the real ones), a campaign tracking link that records clicks,
// and helpers to fire what UTMCAP sends back (traffic-source postbacks and
// signed webhooks). In memory, one per test run.

type FakeClick = {
  click_id: string;
  campaign_id: string;
  source_id: string | null;
  /** The traffic source's external id parameter's value (sc_cid). */
  external_id: string | null;
  subs: Record<string, string>;
  created_at: string;
};

type FakeConversion = {
  click_id: string;
  conversion_id: string;
  status: string;
  payout: number;
  currency: string;
  source_id: string | null;
  campaign_id: string;
  sub1: string | null;
};

type FakeWebhook = {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  secret: string;
};

export type FakeUtmcap = {
  /** e.g. http://127.0.0.1:53211 */
  origin: string;
  /** The API base, for UTMCAP_API_URL. */
  apiUrl: string;
  apiKey: string;
  sources: (UtmcapTrafficSource & { tags: string[] })[];
  webhooks: FakeWebhook[];
  campaigns: UtmcapCampaign[];
  clicks: FakeClick[];
  conversions: FakeConversion[];
  /** Every API request, newest last: method, path, idempotency key. */
  requests: { method: string; path: string; idempotencyKey: string | null }[];
  /** The next N API calls answer 429 with Retry-After: 1. */
  rateLimitNext(n: number): void;
  addCampaign(name: string, destination?: string): UtmcapCampaign;
  /**
   * UTMCAP records a conversion and calls the traffic source's postback URL
   * (only for approved ones, as UTMCAP does), then sends conversion webhooks.
   */
  convert(
    clickId: string,
    conversion: { conversionId: string; payout: number; status?: string; currency?: string },
  ): Promise<{ postback: string | null; webhooks: number[] }>;
  /** Sends one event to the subscribed endpoints, signed; returns their statuses. */
  sendWebhook(type: string, data: Record<string, unknown>, eventId?: string): Promise<number[]>;
  close(): Promise<void>;
};

const json = (data: unknown, status = 200) => ({
  status,
  body: JSON.stringify(status < 400 ? { data, error: null } : { data: null, error: data }),
});

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const id = () => randomUUID();
/** UTMCAP click ids look like 06G873SECHWDV2V9G455CJFVKC. */
const clickId = () =>
  [...randomBytes(26)].map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join("");

export async function startFakeUtmcap({
  port = 0,
  apiKey = "utmk_test_0123456789",
  /** Whether {utmcap_id} is filled in traffic-source postbacks (the docs only promise {external_id}). */
  postbackHasUtmcapId = true,
}: { port?: number; apiKey?: string; postbackHasUtmcapId?: boolean } = {}): Promise<FakeUtmcap> {
  let limited = 0;
  const idempotent = new Map<string, { status: number; body: string }>();

  const api = async (
    method: string,
    path: string,
    query: URLSearchParams,
    body: string,
  ): Promise<{ status: number; body: string }> => {
    if (limited > 0) {
      limited--;
      return json({ message: "This minute's calls are used up.", code: "rate_limited" }, 429);
    }
    if (method === "GET" && path === "/campaigns") {
      return json({ range: { from: "", to: "" }, rows: fake.campaigns, next_cursor: null });
    }
    if (method === "GET" && path === "/traffic-sources") {
      return json({ range: { from: "", to: "" }, rows: fake.sources, next_cursor: null });
    }
    if (method === "POST" && path === "/traffic-sources") {
      const input = JSON.parse(body || "{}");
      if (!input.name) return json({ message: "name is required", code: "invalid_input" }, 422);
      if (fake.sources.some((s) => s.name === input.name)) {
        return json({ message: "A source with this name exists.", code: "conflict" }, 409);
      }
      const source = {
        id: id(),
        name: input.name,
        postback_url: input.postback_url ?? null,
        token_macros: input.token_macros ?? {},
        external_id_param: input.external_id_param ?? null,
        tags: input.tags ?? [],
        status: "active" as const,
        created_at: new Date().toISOString(),
      };
      fake.sources.push(source);
      return json(source, 201);
    }
    if (method === "GET" && path === "/webhooks") {
      return json({
        planIncludes: true,
        events: [],
        rows: fake.webhooks.map(({ secret: _secret, ...w }) => ({
          ...w,
          lastDeliveredAt: null,
          lastWeek: { delivered: 0, failed: 0, pending: 0 },
        })),
      });
    }
    if (method === "POST" && path === "/webhooks") {
      const input = JSON.parse(body || "{}");
      if (!/^https?:\/\//.test(input.url ?? "")) {
        return json({ message: "Not https, or not a public address.", code: "invalid_url" }, 400);
      }
      if (!Array.isArray(input.events) || input.events.length === 0) {
        return json({ message: "No events.", code: "invalid_events" }, 400);
      }
      const webhook = {
        id: id(),
        name: input.name ?? "",
        url: input.url,
        events: input.events,
        active: true,
        createdAt: new Date().toISOString(),
        secret: `whsec_${randomBytes(24).toString("hex")}`,
      };
      fake.webhooks.push(webhook);
      return json(webhook, 201);
    }
    const click = path.match(/^\/logs\/clicks\/([^/]+)$/);
    if (method === "GET" && click) {
      const found = fake.clicks.find((c) => c.click_id === decodeURIComponent(click[1]!));
      if (!found) return json({ message: "No such click.", code: "not_found" }, 404);
      return json({
        click_id: found.click_id,
        hops: [{ type: "click", campaign_id: found.campaign_id, query: found.subs }],
        conversions: fake.conversions.filter((c) => c.click_id === found.click_id),
        names: {
          external_id: found.external_id,
          source_id: found.source_id,
          ...found.subs,
        },
        visitor: null,
      });
    }
    if (method === "GET" && path === "/reports/performance") {
      const dimension = query.get("dimension") ?? "campaign";
      const source = query.get("f.source");
      const groups = new Map<string, { conversions: number; revenue: number; pending: number }>();
      for (const c of fake.conversions) {
        if (source && c.source_id !== source) continue;
        const key = dimension === "sub1" ? (c.sub1 ?? "") : c.campaign_id;
        const g = groups.get(key) ?? { conversions: 0, revenue: 0, pending: 0 };
        if (c.status === "approved") {
          g.conversions++;
          g.revenue += c.payout;
        } else if (c.status === "pending") g.pending++;
        groups.set(key, g);
      }
      return json({
        range: { from: query.get("from"), to: query.get("to") },
        dimension,
        dimensions: [dimension],
        filters: [],
        rows: [...groups].map(([key, g]) => ({
          dims: [key],
          dimension: key,
          clicks: fake.clicks.filter((k) => (k.subs.sub1 ?? "") === key).length,
          unique_clicks: 0,
          conversions: g.conversions,
          pending: g.pending,
          rejected: 0,
          revenue: Math.round(g.revenue * 100) / 100,
          pending_revenue: 0,
          rejected_revenue: 0,
        })),
        labels: {},
      });
    }
    return json({ message: `No such endpoint: ${method} ${path}`, code: "not_found" }, 404);
  };

  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://fake");
    const body = request.method === "GET" ? "" : await readBody(request);

    if (url.pathname.startsWith("/api/v1/")) {
      const path = url.pathname.slice("/api/v1".length);
      const idempotencyKey = (request.headers["idempotency-key"] as string) ?? null;
      fake.requests.push({ method: request.method!, path, idempotencyKey });
      if (request.headers.authorization !== `Bearer ${fake.apiKey}`) {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ data: null, error: { message: "Bad key", code: "unauthorized" } }),
        );
        return;
      }
      const replay = idempotencyKey ? idempotent.get(idempotencyKey) : undefined;
      const answer = replay ?? (await api(request.method!, path, url.searchParams, body));
      if (idempotencyKey && !replay && answer.status < 300) idempotent.set(idempotencyKey, answer);
      response.writeHead(answer.status, {
        "content-type": "application/json",
        ...(answer.status === 429 ? { "retry-after": "1" } : {}),
        ...(replay ? { "idempotent-replayed": "true" } : {}),
      });
      response.end(answer.body);
      return;
    }

    // A campaign's tracking link: https://{domain}/{alias}?sc_cid=…&sub1=…
    const campaign = fake.campaigns.find((c) => url.pathname === `/${c.alias}`);
    if (campaign) {
      const source = fake.sources[0] ?? null;
      const external = source?.external_id_param
        ? url.searchParams.get(source.external_id_param)
        : null;
      const subs: Record<string, string> = {};
      for (let i = 1; i <= 10; i++) {
        const v = url.searchParams.get(`sub${i}`);
        if (v) subs[`sub${i}`] = v;
      }
      fake.clicks.push({
        click_id: clickId(),
        campaign_id: campaign.id,
        source_id: source?.id ?? null,
        external_id: external,
        subs,
        created_at: new Date().toISOString(),
      });
      response.writeHead(302, { location: `${fake.origin}/offer` });
      response.end();
      return;
    }
    response.writeHead(url.pathname === "/offer" ? 200 : 404, { "content-type": "text/html" });
    response.end(url.pathname === "/offer" ? "<h1>The offer</h1>" : "not found");
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const fake: FakeUtmcap = {
    origin,
    apiUrl: `${origin}/api/v1`,
    apiKey,
    sources: [],
    webhooks: [],
    campaigns: [],
    clicks: [],
    conversions: [],
    requests: [],
    rateLimitNext(n) {
      limited = n;
    },
    addCampaign(name, destination = `${origin}/offer`) {
      const alias = `c${randomBytes(4).toString("hex")}`;
      const campaign: UtmcapCampaign = {
        id: id(),
        name,
        alias,
        status: "active",
        url: `${origin}/${alias}`,
        domain: new URL(origin).host,
        source_id: null,
        source_name: null,
        currency: "USD",
        created_at: new Date().toISOString(),
        clicks: 0,
        conversions: 0,
        revenue: 0,
      };
      void destination;
      fake.campaigns.push(campaign);
      return campaign;
    },
    async convert(ucid, { conversionId, payout, status = "approved", currency = "USD" }) {
      const click = fake.clicks.find((c) => c.click_id === ucid);
      if (!click) throw new Error(`fake UTMCAP: no click ${ucid}`);
      const existing = fake.conversions.find((c) => c.conversion_id === conversionId);
      const isNew = !existing;
      const conversion = existing ?? {
        click_id: ucid,
        conversion_id: conversionId,
        status,
        payout,
        currency,
        source_id: click.source_id,
        campaign_id: click.campaign_id,
        sub1: click.subs.sub1 ?? null,
      };
      Object.assign(conversion, { status, payout, currency });
      if (isNew) fake.conversions.push(conversion);

      let postback: string | null = null;
      const source = fake.sources.find((s) => s.id === click.source_id);
      if (status === "approved" && source?.postback_url) {
        postback = source.postback_url
          .replaceAll("{external_id}", encodeURIComponent(click.external_id ?? ""))
          .replaceAll("{payout}", String(payout))
          .replaceAll("{status}", status)
          .replaceAll("{currency}", currency)
          .replaceAll("{utmcap_id}", postbackHasUtmcapId ? ucid : "");
        await fetch(postback).catch(() => null);
      }
      const webhooks = await fake.sendWebhook(isNew ? "conversion.created" : "conversion.updated", {
        click_id: ucid,
        conversion_id: conversionId,
        status,
        payout,
        currency,
        goal: "default",
        campaign_id: click.campaign_id,
        offer_id: null,
        source_id: click.source_id,
        recorded_at: new Date().toISOString().replace("T", " ").slice(0, 23),
        source: "postback",
      });
      return { postback, webhooks };
    },
    async sendWebhook(type, data, eventId = id()) {
      const statuses: number[] = [];
      for (const webhook of fake.webhooks.filter((w) => w.events.includes(type))) {
        const body = JSON.stringify({
          id: eventId,
          type,
          created_at: new Date().toISOString(),
          account_id: "acct_fake",
          data,
        });
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "utmcap-signature": signUtmcapBody(webhook.secret, body),
            "utmcap-event": type,
            "utmcap-delivery": id(),
          },
          body,
          redirect: "manual",
        }).catch(() => null);
        statuses.push(response?.status ?? 0);
      }
      return statuses;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
  return fake;
}
