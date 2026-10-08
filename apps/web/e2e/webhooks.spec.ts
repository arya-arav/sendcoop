import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";
import { CHROME, waitForTrackedUrls } from "./tracked";

// A test endpoint: keeps what Sendcoop POSTs to it.
type Received = { body: Record<string, any>; timestamp: string; signature: string; raw: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
const received: Received[] = [];
let server: Server;
const PORT = 3019;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received.push({
        body: JSON.parse(raw),
        raw,
        timestamp: String(req.headers["sendcoop-timestamp"]),
        signature: String(req.headers["sendcoop-signature"]),
      });
      res.writeHead(200).end("ok");
    });
  });
  await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", r));
});

test.afterAll(async () => {
  await new Promise((r) => server.close(r));
  await closeConnections();
});

const eventsFor = (email: string) =>
  received
    .filter((r) => JSON.stringify(r.body.data ?? {}).includes(email))
    .map((r) => r.body.event);

test("subscribed, clicked, converted and unsubscribed events arrive at a test endpoint, signed", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const owner = uniqueEmail("hooks-owner");
  const slug = await signUpWithWorkspace(page, {
    name: "Hook Owner",
    email: owner,
    workspace: `Hooks ${Date.now()}`,
  });
  await getSql()`
    insert into subscriptions (user_id, plan_id, status)
    select u.id, p.id, 'active' from users u, plans p where u.email = ${owner} and p.key = 'growth'`;

  await page.goto(`/w/${slug}/settings`);
  await page.getByRole("link", { name: /Webhooks/ }).click();
  await page.getByLabel("Endpoint URL").fill(`http://127.0.0.1:${PORT}/hook`);
  await page.getByRole("button", { name: "Add endpoint" }).click();
  const endpoints = page.getByRole("table", { name: "Endpoints" });
  await expect(endpoints).toContainText(`127.0.0.1:${PORT}/hook`);

  // A test first.
  await page.getByRole("button", { name: `Send a test to http://127.0.0.1:${PORT}/hook` }).click();
  await expect
    .poll(() => received.some((r) => r.body.event === "webhook.test"), { timeout: 15_000 })
    .toBe(true);

  // Subscribed (the campaign helper adds them), clicked, converted.
  const reader = uniqueEmail("hooks-reader");
  await sendCampaign(slug, [reader], {
    html: `<html><body><a href="https://shop.example/boots">Boots</a></body></html>`,
  });
  const { links } = await waitForTrackedUrls(reader);
  await page.waitForTimeout(5500);
  await request.get(links[0]!, { headers: { "user-agent": CHROME }, maxRedirects: 0 });
  const [ws] = await getSql()<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  await getSql()`
    insert into conversions (workspace_id, source, event, value, currency, subscriber_id, external_txid)
    select ${ws!.id}, 'api', 'sale', 25, 'USD', id, ${`hook-${Date.now()}`}
    from subscribers where workspace_id = ${ws!.id} and email = ${reader}`;
  await getSql()`
    update subscribers set status = 'unsubscribed', unsubscribed_at = now()
    where workspace_id = ${ws!.id} and email = ${reader}`;

  await expect
    .poll(() => eventsFor(reader).sort(), { timeout: 30_000 })
    .toEqual([
      "conversion.created",
      "email.clicked",
      "subscriber.subscribed",
      "subscriber.unsubscribed",
    ]);

  // Each is signed with the workspace's webhook secret.
  await page.goto(`/w/${slug}/integrations`);
  const secret = await page.getByLabel("Webhook signing secret").inputValue();
  for (const r of received.filter((x) => JSON.stringify(x.body).includes(reader))) {
    const expected = `sha256=${createHmac("sha256", secret).update(`${r.timestamp}.${r.raw}`).digest("hex")}`;
    expect(r.signature).toBe(expected);
  }
  const click = received.find(
    (r) => r.body.event === "email.clicked" && r.body.data.email === reader,
  )!;
  expect(click.body.data.url).toBe("https://shop.example/boots");

  // The deliveries are listed.
  await page.goto(`/w/${slug}/settings/webhooks`);
  await expect(page.getByRole("table", { name: "Deliveries" })).toContainText("conversion.created");
  await expect(page.getByRole("table", { name: "Deliveries" })).toContainText("Delivered (200)");
});
