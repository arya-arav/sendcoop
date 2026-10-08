import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test.afterAll(closeConnections);

test("a campaign's links are recorded, with affiliate links marked", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Affiliate",
    email: uniqueEmail("links"),
    workspace: `Links ${Date.now()}`,
  });

  // The workspace's own affiliate domain
  await page.goto(`/w/${slug}/settings`);
  await page.getByRole("link", { name: /Tracking/ }).click();
  await expect(page.getByText("ClickBank")).toBeVisible();
  await page
    .getByLabel("Affiliate domains")
    .fill("https://www.MyPartner.com/offers\nmypartner.com");
  await page.getByRole("button", { name: "Save domains" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved 1 domain.");
  await expect(page.getByLabel("Affiliate domains")).toHaveValue("mypartner.com");

  const { campaignId } = await sendCampaign(slug, [uniqueEmail("links-reader")], {
    html: `<html><body>
      <p><a href="https://vendor.hop.clickbank.net/?affiliate=me">Get the guide</a></p>
      <p><a href="https://go.mypartner.com/deal">Partner deal</a></p>
      <p><a href="https://blog.example.com/post">Read the post</a></p>
    </body></html>`,
  });

  // Once the campaign has gone out, its links are on its page.
  await expect
    .poll(
      async () =>
        (
          await getSql()<
            { status: string }[]
          >`select status from campaigns where id = ${campaignId}`
        )[0]?.status,
      { timeout: 20_000 },
    )
    .toBe("sent");
  await page.goto(`/w/${slug}/campaigns/${campaignId}`);
  await expect(page.getByRole("heading", { name: "Links" })).toBeVisible();
  const rows = page.getByRole("row");
  await expect(rows.filter({ hasText: "Get the guide" })).toContainText("Affiliate: ClickBank");
  await expect(rows.filter({ hasText: "Partner deal" })).toContainText(
    "Affiliate: Your affiliate domain",
  );
  await expect(rows.filter({ hasText: "Read the post" })).not.toContainText("Affiliate");
});
