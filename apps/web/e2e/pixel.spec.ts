import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

test.afterAll(closeConnections);

// The test store is a made-up public site loading sc.js from localhost, which
// Chromium blocks (local network access). Real stores load it from the
// public tracking domain.
test.use({
  launchOptions: {
    args: [
      "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,LocalNetworkAccessChecks",
    ],
  },
});

test("a test store page with sc.js records a sale, credited to the email", async ({ page }) => {
  test.setTimeout(60_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Store Owner",
    email: uniqueEmail("pixel"),
    workspace: `Pixel ${Date.now()}`,
  });
  const reader = uniqueEmail("pixel-reader");
  const { campaignId } = await sendCampaign(slug, [reader], {
    html: `<html><body><a href="http://www.shop.example/boots">See the boots</a></body></html>`,
  });

  // The install snippet from settings
  await page.goto(`/w/${slug}/settings/tracking`);
  const snippet = await page.getByLabel("Pixel snippet").inputValue();
  expect(snippet).toMatch(/src="http:\/\/localhost:3001\/sc\.js" data-key="px_\w{32}"/);

  // A store: product pages on www, the thank-you page on checkout
  await page.context().route(/^http:\/\/(www|checkout)\.shop\.example\//, (route) => {
    const thanks = route.request().url().includes("/thanks");
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head>${snippet}</head><body>
        <h1>${thanks ? "Thanks for your order" : "Boots"}</h1>
        ${thanks ? `<script>sc("conversion", { value: 129.99, currency: "USD", order_id: "SHOP-${Date.now()}" });</script>` : ""}
      </body></html>`,
    });
  });

  // The reader clicks through from the email...
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
  // Playwright doesn't route a redirect's target: follow it by hand.
  const redirect = await shopper.request.get(link!, { maxRedirects: 0 });
  await shopper.goto(redirect.headers().location!);
  await expect(shopper).toHaveURL(/www\.shop\.example\/boots\?.*sc_cid=sc\w{16}/);
  const clickId = new URL(shopper.url()).searchParams.get("sc_cid")!;
  // ...the pixel keeps the click id for the whole store...
  await expect.poll(() => shopper.evaluate(() => document.cookie)).toContain(`sc_cid=${clickId}`);

  // ...and buys later, on another page and subdomain, without it in the URL
  await shopper.goto("http://checkout.shop.example/thanks");
  await expect(shopper.getByRole("heading", { name: "Thanks for your order" })).toBeVisible();

  const sql = getSql();
  await expect
    .poll(
      async () =>
        sql<{ source: string; click_id: string; value: number; campaign_id: string }[]>`
          select source, click_id, value::float8 as value, campaign_id from conversions
          where campaign_id = ${campaignId}`,
      { timeout: 10_000 },
    )
    .toEqual([{ source: "pixel", click_id: clickId, value: 129.99, campaign_id: campaignId }]);

  // It's in the recent conversions, credited to the campaign
  await page.goto(`/w/${slug}/settings/tracking`);
  const row = page
    .locator("[data-slot=card]", { hasText: "Recent conversions" })
    .getByRole("row")
    .filter({ hasText: "Pixel" });
  await expect(row).toContainText("$129.99");
  await expect(row.getByRole("link")).toHaveAttribute("href", `/w/${slug}/campaigns/${campaignId}`);
});
