import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";
import { CHROME, waitForTrackedUrls } from "./tracked";

test.afterAll(async () => {
  await getSql()`delete from fx_rates where currency = 'GBP' and day = ${DAY} and per_eur = 0.8`;
  await closeConnections();
});

// A rate for a day of its own (200 days ago), so the real ones, loaded from
// the day the worker first ran, never interfere.
const DAY = new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10);

test("a refund postback takes the revenue back, and sales in pounds are reported in euros", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const sql = getSql();
  await sql`insert into fx_rates (currency, day, per_eur) values ('GBP', ${DAY}, 0.8)
            on conflict (currency, day) do update set per_eur = excluded.per_eur`;
  const slug = await signUpWithWorkspace(page, {
    name: "Currency Keeper",
    email: uniqueEmail("currency"),
    workspace: `Currency ${Date.now()}`,
  });
  const reader = uniqueEmail("currency-reader");
  const { campaignId } = await sendCampaign(slug, [reader], {
    name: "Worldwide",
    html: `<html><body><a href="https://vendor.hop.clickbank.net/?affiliate=me">Shop</a></body></html>`,
  });
  const { links } = await waitForTrackedUrls(reader);
  await page.waitForTimeout(5500);
  const redirect = await request.get(links[0]!, {
    headers: { "user-agent": CHROME },
    maxRedirects: 0,
  });
  const clickId = new URL(redirect.headers().location!).searchParams.get("tid")!;

  // A sale, then the network reports its refund
  await page.goto(`/w/${slug}/settings/tracking`);
  const postback = (await page.getByLabel("Postback URL", { exact: true }).inputValue())
    .replace("{subid}", clickId)
    .replace("{txid}", "CUR-1");
  expect(await (await request.get(postback.replace("{payout}", "80"))).text()).toBe("ok created");
  const revenue = page
    .getByRole("region", { name: "Results" })
    .locator("[data-slot=card]")
    .filter({ has: page.getByText("Revenue", { exact: true }) });
  await page.goto(`/w/${slug}/campaigns/${campaignId}`);
  await expect(revenue).toContainText("$80.00");
  expect(
    await (await request.get(`${postback.replace("{payout}", "80")}&status=refund`)).text(),
  ).toBe("ok updated");
  await page.reload();
  await expect(revenue).toContainText("$0.00");

  // Report in euros; a sale in pounds arrives through the API
  await page.goto(`/w/${slug}/settings/tracking`);
  await page.getByLabel("Currency", { exact: true }).selectOption("EUR");
  await page
    .getByRole("button", { name: "Save" })
    .filter({ hasText: /^Save$/ })
    .first()
    .click();
  await expect(page.getByText("Saved. Revenue is now shown in EUR.")).toBeVisible();
  const api = page.locator("[data-slot=card]", { hasText: "Conversion API" });
  const secret = await api.getByLabel("API secret").inputValue();
  const workspaceId = await api.getByLabel("Workspace id").inputValue();
  const body = JSON.stringify({
    click_id: clickId,
    value: 80,
    currency: "GBP",
    order_id: "CUR-2",
    occurred_at: `${DAY}T12:00:00Z`,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const sent = await request.post("http://localhost:3001/v1/conversions", {
    headers: {
      "content-type": "application/json",
      "sendcoop-workspace": workspaceId,
      "sendcoop-timestamp": timestamp,
      "sendcoop-signature": `sha256=${signature}`,
    },
    data: body,
  });
  expect(sent.status()).toBe(201);

  // £80 at 0.8 per euro is €100; the refunded dollar sale stays out
  await page.goto(`/w/${slug}/campaigns/${campaignId}`);
  await expect(revenue).toContainText("€100.00");
  await page.goto(`/w/${slug}/revenue?period=all`);
  await expect(page.getByRole("region", { name: "Totals" })).toContainText("€100.00");
  await page.goto(`/w/${slug}/settings/tracking`);
  const row = page
    .locator("[data-slot=card]", { hasText: "Recent conversions" })
    .getByRole("row")
    .filter({ hasText: "£80.00" });
  await expect(row).toContainText("≈ €100.00");
});
