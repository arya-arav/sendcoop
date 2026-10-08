import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";
const SIGNING_SECRET = "shpss_e2e0123456789abcdef";

test.afterAll(closeConnections);

// The test store is a made-up public site loading sc.js from localhost (see pixel.spec.ts).
test.use({
  launchOptions: {
    args: [
      "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,LocalNetworkAccessChecks",
    ],
  },
});

test("a Shopify order is credited to the email through the cart, and its refund reverses it", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Shopify Merchant",
    email: uniqueEmail("shopify"),
    workspace: `Shopify ${Date.now()}`,
  });
  const reader = uniqueEmail("shopify-reader");
  const { campaignId } = await sendCampaign(slug, [reader], {
    html: `<html><body><a href="http://boots.shop.example/products/boots">Shop boots</a></body></html>`,
  });

  // Connect Shopify: the webhook URL to paste there, and its signing secret here
  await page.goto(`/w/${slug}/settings/tracking`);
  const snippet = await page.getByLabel("Pixel snippet").inputValue();
  const shopify = page
    .locator("[data-slot=card]")
    .filter({ has: page.getByRole("heading", { name: "Shopify", exact: true }) });
  const webhookUrl = await shopify.getByLabel("Shopify webhook URL").inputValue();
  expect(webhookUrl).toMatch(/^http:\/\/localhost:3001\/wh\/shopify\/sh_\w{32}$/);
  await shopify.getByLabel("Webhook signing secret").fill(SIGNING_SECRET);
  await shopify.getByRole("button", { name: "Save" }).click();
  await expect(shopify.getByRole("status")).toHaveText(/Saved/);
  await expect(shopify.getByText("Connected")).toBeVisible();

  // A Shopify store with the pixel in its theme
  let cartAttributes: Record<string, string> | null = null;
  await page.context().route(/^http:\/\/boots\.shop\.example\//, async (route) => {
    if (route.request().url().endsWith("/cart/update.js")) {
      cartAttributes = route.request().postDataJSON().attributes;
      return route.fulfill({ contentType: "application/json", body: "{}" });
    }
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head>
        <script>window.Shopify = { shop: "boots.myshopify.com", routes: { root: "/" } };</script>
        ${snippet}</head><body><h1>Boots</h1></body></html>`,
    });
  });

  // The reader clicks through: sc.js puts the click id in the cart
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const found = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${reader}"`)}`,
        ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
        const id = found.messages?.[0]?.ID;
        if (!id) return false;
        const { HTML } = await fetch(`${MAILPIT}/api/v1/message/${id}`).then(
          (r) => r.json() as Promise<{ HTML: string }>,
        );
        link = HTML.match(/href="(http:\/\/localhost:3001\/c\/[^"]+)"/)?.[1];
        return Boolean(link);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  const shopper = await page.context().newPage();
  const redirect = await shopper.request.get(link!, { maxRedirects: 0 });
  await shopper.goto(redirect.headers().location!);
  const clickId = new URL(shopper.url()).searchParams.get("sc_cid")!;
  await expect.poll(() => cartAttributes).toEqual({ sc_cid: clickId });

  // Shopify reports the order, with the cart attributes as note attributes
  const orderId = Date.now();
  const deliver = (topic: string, payload: unknown) => {
    const body = JSON.stringify(payload);
    return request.post(webhookUrl, {
      headers: {
        "content-type": "application/json",
        "x-shopify-topic": topic,
        "x-shopify-shop-domain": "boots.myshopify.com",
        "x-shopify-hmac-sha256": createHmac("sha256", SIGNING_SECRET).update(body).digest("base64"),
      },
      data: body,
    });
  };
  const order = await deliver("orders/create", {
    id: orderId,
    name: "#1001",
    email: "someone-else@example.com",
    currency: "USD",
    financial_status: "paid",
    total_price: "180.00",
    note_attributes: Object.entries(cartAttributes!).map(([name, value]) => ({ name, value })),
  });
  expect(await order.text()).toBe("ok created");

  const revenue = page
    .getByRole("region", { name: "Results" })
    .locator("[data-slot=card]")
    .filter({ has: page.getByText("Revenue", { exact: true }) });
  await page.goto(`/w/${slug}/campaigns/${campaignId}`);
  await expect(revenue).toContainText("$180.00");

  // ...then its full refund
  const refund = await deliver("refunds/create", {
    id: orderId + 1,
    order_id: orderId,
    transactions: [{ kind: "refund", status: "success", amount: "180.00" }],
  });
  expect(await refund.text()).toBe("ok reversed");
  const [row] = await getSql()<{ status: string; source: string }[]>`
    select status, source from conversions where campaign_id = ${campaignId}`;
  expect(row).toEqual({ status: "reversed", source: "shopify" });
  await page.reload();
  await expect(revenue).toContainText("$0.00");
});
