import { createHmac, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

// A stand-in for Stripe, for the billing tests: the app runs with
// STRIPE_API_BASE pointing here (see playwright.config.ts). It keeps
// customers, Checkout sessions and subscriptions in memory, serves its own
// Checkout and customer portal pages, and posts signed webhooks to the app,
// as Stripe does.

export const FAKE_STRIPE_PORT = 3011;
export const FAKE_STRIPE_WEBHOOK_SECRET = "whsec_e2e_fake";
const BASE = `http://127.0.0.1:${FAKE_STRIPE_PORT}`;
const WEBHOOK_URL = "http://localhost:3000/api/webhooks/stripe";
const MONTH = 30 * 86_400;

type Sub = {
  id: string;
  object: "subscription";
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  metadata: Record<string, string>;
  items: {
    object: "list";
    data: { id: string; price: { id: string }; current_period_end: number }[];
  };
};

type Session = {
  id: string;
  object: "checkout.session";
  mode: string;
  customer: string;
  url: string;
  status: "open" | "complete";
  subscription: string | null;
  success_url: string;
  cancel_url: string;
  price: string;
  metadata: Record<string, string>;
};

export type FakeStripe = {
  /** Price ids to amounts in cents, for the invoices it issues. */
  prices: Map<string, number>;
  subscriptions: Map<string, Sub>;
  webhooks: { type: string; status: number }[];
  /** Ends a subscription now, as an unpaid one ends after Stripe's retries. */
  endSubscription: (id: string) => Promise<void>;
  close: () => Promise<void>;
};

const newId = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;

/** Stripe's form encoding (a[b][0][c]=x) as nested objects. */
function parseForm(body: string) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(body)) {
    const path = key.replace(/\]/g, "").split("[");
    let node = out as Record<string, unknown>;
    path.forEach((part, i) => {
      if (i === path.length - 1) node[part] = value;
      else node = (node[part] ??= {}) as Record<string, unknown>;
    });
  }
  return out as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function startFakeStripe(): Promise<FakeStripe> {
  const customers = new Map<string, Record<string, unknown>>();
  const sessions = new Map<string, Session>();
  const subscriptions = new Map<string, Sub>();
  const prices = new Map<string, number>();
  const webhooks: FakeStripe["webhooks"] = [];

  const invoices = new Map<string, Record<string, unknown>>();
  let invoiceNumber = 0;
  /** Bills a subscription's current price, paid at once (as with a card). */
  const issueInvoice = async (subscription: Sub, description: string) => {
    const iid = newId("in");
    const now = Math.floor(Date.now() / 1000);
    const amount = prices.get(subscription.items.data[0]!.price.id) ?? 1900;
    const invoice = {
      id: iid,
      object: "invoice",
      customer: subscription.customer,
      subscription: subscription.id,
      number: `FAKE-${String(++invoiceNumber).padStart(4, "0")}`,
      status: "paid",
      amount_due: amount,
      amount_paid: amount,
      currency: "usd",
      attempt_count: 1,
      hosted_invoice_url: `${BASE}/invoice/${iid}`,
      invoice_pdf: `${BASE}/invoice/${iid}.pdf`,
      period_start: now,
      period_end: now + MONTH,
      created: now,
      status_transitions: { paid_at: now },
      lines: { object: "list", data: [{ description }] },
    };
    invoices.set(iid, invoice);
    await sendWebhook("invoice.paid", invoice);
  };

  const sendWebhook = async (type: string, object: unknown) => {
    const payload = JSON.stringify({
      id: newId("evt"),
      object: "event",
      type,
      api_version: "2026-09-30.endive",
      created: Math.floor(Date.now() / 1000),
      data: { object },
    });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", FAKE_STRIPE_WEBHOOK_SECRET)
      .update(`${t}.${payload}`)
      .digest("hex");
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${v1}` },
      body: payload,
    }).catch(() => null);
    webhooks.push({ type, status: res?.status ?? 0 });
  };

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "request-id": newId("req") });
    res.end(JSON.stringify(body));
  };
  const notFound = (res: ServerResponse) =>
    json(res, 404, { error: { type: "invalid_request_error", message: "No such object" } });
  const page = (res: ServerResponse, title: string, button: string, action: string) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><title>${title}</title><h1>${title}</h1>
      <form method="post" action="${action}"><button>${button}</button></form>`);
  };
  const redirect = (res: ServerResponse, url: string) => {
    res.writeHead(303, { location: url });
    res.end();
  };

  async function handle(req: IncomingMessage, res: ServerResponse, body: string) {
    const url = new URL(req.url ?? "/", BASE);
    const parts = url.pathname.split("/").filter(Boolean);
    const form = parseForm(body);

    // The API (what the Stripe SDK calls)
    if (parts[0] === "v1") {
      const [, resource, id, sub] = parts;
      if (resource === "balance") {
        return json(res, 200, { object: "balance", livemode: false, available: [], pending: [] });
      }
      if (resource === "customers" && req.method === "POST") {
        const customer = { id: newId("cus"), object: "customer", ...form };
        customers.set(customer.id, customer);
        return json(res, 200, customer);
      }
      if (resource === "checkout" && id === "sessions") {
        if (req.method === "POST" && !sub) {
          const sid = newId("cs_test");
          const session: Session = {
            id: sid,
            object: "checkout.session",
            mode: form.mode,
            customer: form.customer,
            url: `${BASE}/checkout/${sid}`,
            status: "open",
            subscription: null,
            success_url: form.success_url,
            cancel_url: form.cancel_url,
            price: form.line_items?.["0"]?.price,
            metadata: form.subscription_data?.metadata ?? {},
          };
          sessions.set(sid, session);
          return json(res, 200, session);
        }
        const session = sub ? sessions.get(sub) : null;
        return session ? json(res, 200, session) : notFound(res);
      }
      if (resource === "subscriptions" && id) {
        const subscription = subscriptions.get(id);
        if (!subscription) return notFound(res);
        if (req.method === "DELETE") {
          subscription.status = "canceled";
          await sendWebhook("customer.subscription.deleted", subscription);
          return json(res, 200, subscription);
        }
        if (req.method === "POST") {
          const price = form.items?.["0"]?.price;
          if (price) {
            subscription.items.data[0]!.price = { id: price };
            await issueInvoice(subscription, `Switch to ${price}`);
          }
          if (form.cancel_at_period_end !== undefined) {
            subscription.cancel_at_period_end = form.cancel_at_period_end === "true";
          }
          await sendWebhook("customer.subscription.updated", subscription);
        }
        return json(res, 200, subscription);
      }
      if (resource === "invoices" && id) {
        const invoice = invoices.get(id);
        return invoice ? json(res, 200, invoice) : notFound(res);
      }
      if (resource === "billing_portal" && id === "sessions" && req.method === "POST") {
        const pid = newId("bps");
        portals.set(pid, { customer: form.customer, return_url: form.return_url });
        return json(res, 200, {
          id: pid,
          object: "billing_portal.session",
          url: `${BASE}/portal/${pid}`,
        });
      }
      return notFound(res);
    }

    // Stripe's hosted pages
    if (parts[0] === "checkout" && parts[1]) {
      const session = sessions.get(parts[1]);
      if (!session) return notFound(res);
      if (req.method === "GET") return page(res, "Fake Checkout", "Pay", `/checkout/${session.id}`);
      const subscription: Sub = {
        id: newId("sub"),
        object: "subscription",
        customer: session.customer,
        status: "active",
        cancel_at_period_end: false,
        metadata: session.metadata,
        items: {
          object: "list",
          data: [
            {
              id: newId("si"),
              price: { id: session.price },
              current_period_end: Math.floor(Date.now() / 1000) + MONTH,
            },
          ],
        },
      };
      subscriptions.set(subscription.id, subscription);
      Object.assign(session, { status: "complete", subscription: subscription.id });
      await sendWebhook("customer.subscription.created", subscription);
      await issueInvoice(subscription, `Subscription to ${session.price}`);
      await sendWebhook("checkout.session.completed", session);
      return redirect(res, session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id));
    }
    if (parts[0] === "portal" && parts[1]) {
      const portal = portals.get(parts[1]);
      if (!portal) return notFound(res);
      if (req.method === "GET")
        return page(res, "Fake billing portal", "Cancel plan", url.pathname);
      for (const subscription of subscriptions.values()) {
        if (subscription.customer !== portal.customer || subscription.status !== "active") continue;
        subscription.cancel_at_period_end = true;
        await sendWebhook("customer.subscription.updated", subscription);
      }
      return redirect(res, portal.return_url);
    }
    return notFound(res);
  }

  const portals = new Map<string, { customer: string; return_url: string }>();
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      handle(req, res, body).catch((error) => json(res, 500, { error: String(error) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(FAKE_STRIPE_PORT, "127.0.0.1", resolve));

  return {
    prices,
    subscriptions,
    webhooks,
    endSubscription: async (id) => {
      const subscription = subscriptions.get(id);
      if (!subscription) return;
      subscription.status = "canceled";
      await sendWebhook("customer.subscription.deleted", subscription);
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
}
