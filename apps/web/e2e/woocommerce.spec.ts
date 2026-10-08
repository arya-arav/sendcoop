import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

test.afterAll(closeConnections);

test("a WooCommerce order with the plugin's click id is credited to the email", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Woo Merchant",
    email: uniqueEmail("woo"),
    workspace: `Woo ${Date.now()}`,
  });
  const reader = uniqueEmail("woo-reader");
  const { campaignId } = await sendCampaign(slug, [reader], {
    html: `<html><body><a href="https://mugs.example/product/mug">Mugs</a></body></html>`,
  });

  await page.goto(`/w/${slug}/settings/tracking`);
  const woo = page
    .locator("[data-slot=card]")
    .filter({ has: page.getByRole("heading", { name: "WooCommerce", exact: true }) });
  const deliveryUrl = await woo.getByLabel("WooCommerce delivery URL").inputValue();
  const secret = await woo.getByLabel("WooCommerce secret").inputValue();
  expect(deliveryUrl).toMatch(/^http:\/\/localhost:3001\/wh\/woocommerce\/wc_\w{32}$/);
  expect(secret).toMatch(/^\w{32}$/);

  // The plugin downloads as a zip WordPress can install
  const downloading = page.waitForEvent("download");
  await woo.getByRole("link", { name: "Download the plugin" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("sendcoop-woocommerce.zip");
  const archive = readFileSync(await download.path());
  expect(archive.subarray(0, 2).toString()).toBe("PK");
  expect(archive.toString("latin1")).toContain("sendcoop-woocommerce/sendcoop-woocommerce.php");
  expect(archive.toString("latin1")).toContain("Plugin Name: Sendcoop for WooCommerce");

  // WooCommerce checks the URL when the webhook is saved
  const ping = await request.post(deliveryUrl, {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: "webhook_id=1",
  });
  expect(await ping.text()).toBe("ok ping");

  // The reader clicks through to the store; the plugin keeps sc_cid for the order
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
  const redirect = await request.get(link!, { maxRedirects: 0 });
  const clickId = new URL(redirect.headers().location!).searchParams.get("sc_cid")!;

  // WooCommerce delivers the order, signed with the secret
  const body = JSON.stringify({
    id: 1201,
    number: "1201",
    status: "processing",
    currency: "USD",
    total: "36.50",
    billing: { email: "a-guest@example.com" },
    meta_data: [{ id: 51, key: "sc_cid", value: clickId }],
    refunds: [],
  });
  const delivered = await request.post(deliveryUrl, {
    headers: {
      "content-type": "application/json",
      "x-wc-webhook-topic": "order.created",
      "x-wc-webhook-source": "https://mugs.example/",
      "x-wc-webhook-signature": createHmac("sha256", secret).update(body).digest("base64"),
    },
    data: body,
  });
  expect(await delivered.text()).toBe("ok created");

  await page.goto(`/w/${slug}/campaigns/${campaignId}`);
  await expect(
    page
      .getByRole("region", { name: "Results" })
      .locator("[data-slot=card]")
      .filter({ has: page.getByText("Revenue", { exact: true }) }),
  ).toContainText("$36.50");
});
