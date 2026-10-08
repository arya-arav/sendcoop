import { expect, test } from "@playwright/test";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";
import { CHROME, waitForTrackedUrls } from "./tracked";

test.afterAll(closeConnections);

test("a subscriber's profile shows their journey from email to sale, and their value", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Journey Watcher",
    email: uniqueEmail("profile"),
    workspace: `Profile ${Date.now()}`,
  });
  const reader = uniqueEmail("profile-reader");
  await sendCampaign(slug, [{ email: reader, firstName: "Robin" }], {
    name: "Boots launch",
    html: `<html><body><a href="https://vendor.hop.clickbank.net/?affiliate=me">Boots</a></body></html>`,
  });
  const { links, pixel } = await waitForTrackedUrls(reader);

  // Robin opens and clicks like a person (after the scanners' first seconds), then buys
  await page.waitForTimeout(5500);
  await request.get(pixel!, { headers: { "user-agent": CHROME } });
  const redirect = await request.get(links[0]!, {
    headers: { "user-agent": CHROME },
    maxRedirects: 0,
  });
  const clickId = new URL(redirect.headers().location!).searchParams.get("tid")!;
  await page.goto(`/w/${slug}/settings/tracking`);
  const postback = await page.getByLabel("Postback URL", { exact: true }).inputValue();
  await request.get(
    postback.replace("{subid}", clickId).replace("{payout}", "64.00").replace("{txid}", "J-1"),
  );

  // From the contacts list to Robin's profile
  await page.goto(`/w/${slug}/contacts`);
  await page.getByRole("link", { name: reader }).click();
  await expect(page.getByRole("heading", { name: reader })).toBeVisible();
  const value = page.getByRole("region", { name: "Value" });
  await expect(value).toContainText("Lifetime value$64.00");
  await expect(value).toContainText("Conversions1");

  const timeline = page.getByRole("list", { name: "Timeline" });
  await expect(timeline.getByRole("listitem")).toHaveCount(5);
  expect(
    await timeline.getByRole("listitem").evaluateAll((items) => items.map((i) => i.dataset.kind)),
  ).toEqual(["converted", "clicked", "opened", "sent", "subscribed"]);
  await expect(timeline.locator("[data-kind=converted]")).toContainText(
    "Converted $64.00 · approved · Boots launch",
  );
  await expect(timeline.locator("[data-kind=clicked]")).toContainText("Clicked · Boots launch");
  await expect(timeline.locator("[data-kind=clicked]")).toContainText("UTC · Boots");
});
