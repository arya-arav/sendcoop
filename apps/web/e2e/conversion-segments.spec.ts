import { expect, test } from "@playwright/test";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";
import { CHROME, waitForTrackedUrls } from "./tracked";

test.afterAll(closeConnections);

test('a "clicked but didn\'t buy" segment finds the right people, and a buyers one the others', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Segment Seller",
    email: uniqueEmail("convseg"),
    workspace: `Conv segments ${Date.now()}`,
  });
  const [buyer, browser, ignorer] = ["buyer", "browser", "ignorer"].map((n) =>
    uniqueEmail(`convseg-${n}`),
  );
  await sendCampaign(slug, [buyer!, browser!, ignorer!], {
    name: "Boots promo",
    html: `<html><body><a href="https://vendor.hop.clickbank.net/?affiliate=me">Boots</a></body></html>`,
  });
  const [buyerMail, browserMail] = [
    await waitForTrackedUrls(buyer!),
    await waitForTrackedUrls(browser!),
  ];
  await waitForTrackedUrls(ignorer!);

  // Two people click (after the scanners' first seconds); one of them buys
  await page.waitForTimeout(5500);
  const click = (url: string) =>
    request.get(url, { headers: { "user-agent": CHROME }, maxRedirects: 0 });
  const bought = await click(buyerMail.links[0]!);
  await click(browserMail.links[0]!);
  const clickId = new URL(bought.headers().location!).searchParams.get("tid")!;
  await page.goto(`/w/${slug}/settings/tracking`);
  const postback = await page.getByLabel("Postback URL", { exact: true }).inputValue();
  await request.get(
    postback.replace("{subid}", clickId).replace("{payout}", "120").replace("{txid}", "CS-1"),
  );

  // Clicked in Boots promo, and didn't buy
  await page.goto(`/w/${slug}/segments/new`);
  await page.getByLabel("Segment name").fill("Clicked, didn't buy");
  const conditions = page.getByRole("group", { name: "Condition" });
  await page.getByRole("button", { name: "Add condition" }).click();
  await conditions.nth(0).getByLabel("Condition on").selectOption("activity");
  await conditions.nth(0).getByLabel("Activity").selectOption("clicked");
  await conditions.nth(0).getByLabel("Campaign").selectOption({ label: "in Boots promo" });
  await page.getByRole("button", { name: "Add condition" }).click();
  await conditions.nth(1).getByLabel("Condition on").selectOption("activity");
  await conditions.nth(1).getByLabel("Comparison").selectOption("did_not");
  await conditions.nth(1).getByLabel("Activity").selectOption("converted");
  await conditions.nth(1).getByLabel("Within the last days").fill("30");
  await expect(page.getByRole("complementary")).toContainText(/Matching subscribers\s*1/);
  await expect(page.getByText(browser!)).toBeVisible();
  await page.getByRole("button", { name: "Save segment" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  // Reloaded, the conditions are as saved
  await expect(page).toHaveURL(/\/segments\/[0-9a-f-]{36}$/);
  await page.reload();
  await expect(conditions.nth(1).getByLabel("Comparison")).toHaveValue("did_not");
  await expect(conditions.nth(1).getByLabel("Within the last days")).toHaveValue("30");

  // Lifetime value over 100: the buyer
  await page.goto(`/w/${slug}/segments/new`);
  await page.getByRole("button", { name: "Add condition" }).click();
  await conditions.nth(0).getByLabel("Condition on").selectOption("field:lifetime_value");
  await conditions.nth(0).getByLabel("Comparison").selectOption("gt");
  await conditions.nth(0).getByLabel("Value").fill("100");
  await expect(page.getByRole("complementary")).toContainText(/Matching subscribers\s*1/);
  await expect(page.getByText(buyer!)).toBeVisible();
});
