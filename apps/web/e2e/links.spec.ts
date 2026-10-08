import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

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
  await page.getByLabel("utm_source").fill("newsletter");
  await page.getByRole("button", { name: "Save options" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const reader = uniqueEmail("links-reader");
  const { campaignId } = await sendCampaign(slug, [reader], {
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

  // The email's links go through the click tracker, and a click is recorded
  const found = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${reader}"`)}`,
  ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
  const email = await fetch(`${MAILPIT}/api/v1/message/${found.messages[0]!.ID}`).then(
    (r) => r.json() as Promise<{ HTML: string; Text: string }>,
  );
  expect(email.HTML).not.toContain("hop.clickbank.net");
  const tracked = [...email.HTML.matchAll(/href="(http:\/\/localhost:3001\/c\/[^"]+)"/g)].map(
    (m) => m[1]!,
  );
  expect(tracked).toHaveLength(3);

  const response = await page.request.get(tracked[0]!, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  // ClickBank gets the click id in tid, for its postback.
  const [first] = await getSql()<{ click_id: string }[]>`
    select click_id from clicks where campaign_id = ${campaignId}`;
  expect(response.headers().location).toBe(
    `https://vendor.hop.clickbank.net/?affiliate=me&tid=${first!.click_id}`,
  );
  const [click] = await getSql()<{ n: number }[]>`
    select count(*)::int as n from clicks where campaign_id = ${campaignId}`;
  expect(click!.n).toBe(1);

  // An ordinary link gets UTM tags and sc_cid
  const post = await page.request.get(tracked[2]!, { maxRedirects: 0 });
  expect(post.headers().location).toMatch(
    /^https:\/\/blog\.example\.com\/post\?utm_source=newsletter&utm_medium=email&utm_campaign=flash-sale&utm_content=read-the-post&sc_cid=sc\w{16}$/,
  );
});
