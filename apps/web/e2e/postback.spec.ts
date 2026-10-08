import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

test.afterAll(closeConnections);

test("an affiliate network's postback records a sale once, from the URL in settings", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Affiliate Marketer",
    email: uniqueEmail("postback"),
    workspace: `Postback ${Date.now()}`,
  });
  const reader = uniqueEmail("postback-reader");
  const { campaignId } = await sendCampaign(slug, [reader], {
    html: `<html><body><a href="https://vendor.hop.clickbank.net/?affiliate=me">Get the guide</a></body></html>`,
  });

  // The reader clicks the affiliate link in the email
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
  const clickId = new URL(redirect.headers().location!).searchParams.get("tid")!;
  expect(clickId).toMatch(/^sc\w{16}$/);

  // ClickBank's ready-made postback URL from settings, filled in as ClickBank would
  await page.goto(`/w/${slug}/settings/tracking`);
  const generic = await page.getByLabel("Postback URL", { exact: true }).inputValue();
  expect(generic).toMatch(/^http:\/\/localhost:3001\/pb\?key=pk_\w{32}&cid=\{subid\}/);
  await page.getByLabel("Network", { exact: true }).selectOption({ label: "ClickBank" });
  const template = await page.getByLabel("ClickBank postback URL").inputValue();
  expect(template).toBe(
    generic.split("&")[0] +
      "&cid={tid}&payout={affiliate_earnings}&txid={receipt_id}&status={event_type}&network=clickbank",
  );
  const fired = template
    .replace("{tid}", clickId)
    .replace("{affiliate_earnings}", "47.00")
    .replace("{receipt_id}", "CB-RECEIPT-1")
    .replace("{event_type}", "SALE");
  expect(await (await request.get(fired)).text()).toBe("ok created");
  expect(await (await request.get(fired)).text()).toBe("ok duplicate");

  const rows = await getSql()<{ value: number; campaign_id: string; status: string }[]>`
    select value::float8 as value, campaign_id, status from conversions
    where campaign_id = ${campaignId}`;
  expect(rows).toEqual([{ value: 47, campaign_id: campaignId, status: "approved" }]);

  // ...and the campaign's report shows the revenue
  await page.goto(`/w/${slug}/campaigns/${campaignId}`);
  await expect(
    page
      .getByRole("region", { name: "Results" })
      .locator("[data-slot=card]")
      .filter({ has: page.getByText("Revenue", { exact: true }) }),
  ).toContainText("$47.00");
  await page.goto(`/w/${slug}/settings/tracking`);

  // A new key: the old URL stops working
  await page.getByRole("button", { name: "New key" }).click();
  await page.getByRole("button", { name: "Make a new key" }).click();
  await expect(page.getByLabel("Postback URL", { exact: true })).not.toHaveValue(generic);
  expect((await request.get(fired.replace("CB-RECEIPT-1", "CB-RECEIPT-2"))).status()).toBe(401);
});
