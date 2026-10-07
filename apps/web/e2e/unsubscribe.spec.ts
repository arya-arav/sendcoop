import { expect, test } from "@playwright/test";
import { closeConnections, mailpitHeaders, sendCampaign } from "./campaigns";
import { emailLink, signUpWithWorkspace, uniqueEmail } from "./helpers";

test.afterAll(closeConnections);

test("campaign emails can be unsubscribed from in one click or from the page", async ({ page }) => {
  const workspace = `Deals ${Date.now()}`;
  const slug = await signUpWithWorkspace(page, {
    name: "Deal Owner",
    email: uniqueEmail("unsub-owner"),
    workspace,
  });
  const ana = uniqueEmail("unsub-ana");
  const bo = uniqueEmail("unsub-bo");
  await sendCampaign(slug, [ana, bo]);

  // Each email has a visible link in the body and one-click headers
  const anaPage = await emailLink(ana, /http:\/\/localhost:3000\/u\/\S+/);
  const boPage = await emailLink(bo, /http:\/\/localhost:3000\/u\/\S+/);
  const headers = await mailpitHeaders(ana);
  expect(headers["List-Unsubscribe-Post"]).toEqual(["List-Unsubscribe=One-Click"]);
  const oneClick = headers["List-Unsubscribe"]![0]!.slice(1, -1);
  expect(oneClick).toBe(anaPage.replace("/u/", "/api/unsubscribe/"));

  // Gmail's Unsubscribe button: a POST, with no cookies or page involved
  const response = await page.request.post(oneClick, {
    form: { "List-Unsubscribe": "One-Click" },
  });
  expect(response.status()).toBe(200);
  // A mail app that opens the header link in a browser gets the page
  const viaGet = await page.request.get(oneClick, { maxRedirects: 0 });
  expect(viaGet.status()).toBe(303);
  expect(viaGet.headers().location).toBe(anaPage);

  await page.goto(`/w/${slug}/contacts`);
  await expect(page.getByRole("row").filter({ hasText: ana })).toContainText("Unsubscribed");
  await expect(page.getByRole("row").filter({ hasText: bo })).toContainText("Subscribed");

  // The link in the body opens a page; unsubscribing takes a click
  await page.goto(boPage);
  await expect(page.getByRole("heading", { name: `Unsubscribe from ${workspace}?` })).toBeVisible();
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByRole("status")).toHaveText(
    `${bo} won't get any more emails from ${workspace}.`,
  );

  // ...and can be undone
  await page.getByRole("button", { name: "Unsubscribed by mistake? Resubscribe" }).click();
  await expect(page.getByRole("heading", { name: "You're subscribed again" })).toBeVisible();
  await page.goto(`/w/${slug}/contacts`);
  await expect(page.getByRole("row").filter({ hasText: bo })).toContainText("Subscribed");

  // Revisiting the link after unsubscribing shows that straight away
  await page.goto(anaPage);
  await expect(page.getByRole("heading", { name: "You're unsubscribed" })).toBeVisible();

  // A tampered link does nothing
  await page.goto(tamper(boPage));
  await expect(page.getByRole("heading", { name: "This link doesn't work" })).toBeVisible();
  const forged = await page.request.post(tamper(oneClick));
  expect(forged.status()).toBe(404);
});

/** Changes the first character of the token's signature. */
function tamper(url: string) {
  const dot = url.lastIndexOf(".") + 1;
  return url.slice(0, dot) + (url[dot] === "A" ? "B" : "A") + url.slice(dot + 1);
}
