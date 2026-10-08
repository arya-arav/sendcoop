import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test.afterAll(closeConnections);

test("a sending campaign is paused, resumed and finishes", async ({ page }) => {
  test.setTimeout(120_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Controller",
    email: uniqueEmail("controls"),
    workspace: `Controls ${Date.now()}`,
  });
  // 60 people at 5 a second: about 12 seconds of sending.
  const recipients = Array.from({ length: 60 }, (_, i) => uniqueEmail(`ctl-${i}`));
  const { campaignId } = await sendCampaign(slug, recipients, { maxPerSecond: 5 });
  const sent = async () =>
    (
      await getSql()<{ n: number }[]>`
        select count(*)::int as n from messages where campaign_id = ${campaignId} and status = 'sent'`
    )[0]!.n;

  await page.goto(`/w/${slug}/campaigns`);
  const row = page.getByRole("row").filter({ hasText: "Flash sale" });
  await expect(row).toContainText("Sending", { timeout: 15_000 });
  // (The list refreshes itself while sending; go straight to the campaign.)
  await page.goto(`/w/${slug}/campaigns/${campaignId}`);
  await expect(page.getByRole("progressbar", { name: "Sending progress" })).toBeVisible();

  await page.getByRole("button", { name: "Pause Flash sale" }).click();
  await expect(page.getByText("Paused. Nobody else gets it until you resume.")).toBeVisible();
  // Batches check for a pause every second, and a message already waiting on
  // the rate limit still goes: let those settle.
  await page.waitForTimeout(3000);
  const atPause = await sent();
  await page.waitForTimeout(2000);
  expect(await sent()).toBe(atPause);
  expect(atPause).toBeLessThan(60);

  await page.getByRole("button", { name: "Resume Flash sale" }).click();
  // The page refreshes itself while sending.
  await expect(page.getByRole("status").filter({ hasText: "Sent to" })).toHaveText(
    "Sent to 60 of 60 recipients.",
    { timeout: 60_000 },
  );
  expect(await sent()).toBe(60);
  await expect(page.getByRole("button", { name: "Pause Flash sale" })).toHaveCount(0);
});
