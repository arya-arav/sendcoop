import { expect, test } from "@playwright/test";
import { emailCount, emailLink, signUpWithWorkspace, uniqueEmail } from "./helpers";

test("a signup from an external website becomes a confirmed subscriber", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Form Owner",
    email: uniqueEmail("forms"),
    workspace: `Forms ${Date.now()}`,
  });
  const dialog = page.getByRole("dialog");
  await page.goto(`/w/${slug}/lists`);
  await page.getByRole("button", { name: "Create your first list" }).click();
  await dialog.getByLabel("Name").fill("Newsletter");
  await dialog.getByRole("button", { name: "Create list" }).click();
  await expect(dialog).toBeHidden();

  // Create a double opt-in form that adds to the list
  await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: "Forms" }).click();
  await page.getByRole("link", { name: "Create your first form" }).click();
  await page.getByLabel("Heading").fill("Get the keto cheat sheet");
  await page.getByLabel("Newsletter").check();
  await expect(page.getByLabel("Double opt-in")).toBeChecked();
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page).toHaveURL(/\/forms\/[0-9a-f-]+$/);

  const embed = await page.getByLabel("Embed code").inputValue();
  expect(embed).toContain("/api/forms/");
  const hostedUrl = await page.getByLabel("Hosted page link").inputValue();

  // Paste the embed code into a page on another website
  await page.route("https://external.example/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body><h1>Keto blog</h1>${embed}</body></html>`,
    }),
  );
  const reader = uniqueEmail("reader");
  await page.goto("https://external.example/blog");
  await page.getByLabel("Email").fill(reader);
  await page.getByLabel("First name").fill("Rita");
  await page.getByRole("button", { name: "Subscribe" }).click();
  await expect(page).toHaveURL(/\/f\/[a-zA-Z0-9]+\/thanks\?confirm=1$/);
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  // Pending until confirmed
  await page.goto(`/w/${slug}/contacts`);
  const row = page.getByRole("row").filter({ hasText: reader });
  await expect(row).toContainText("Pending");
  await expect(row).toContainText("Newsletter");

  // The confirmation email's link opens a page; the button confirms
  const confirmUrl = await emailLink(reader, /http:\/\/localhost:3000\/confirm\/\S+/);
  await page.goto(confirmUrl);
  await page.getByRole("button", { name: "Confirm subscription" }).click();
  await expect(page.getByRole("status")).toHaveText("Thanks for subscribing!");

  await page.goto(`/w/${slug}/contacts`);
  await expect(row).toContainText("Subscribed");
  await expect(row).toContainText("Rita");

  // Signing up again while subscribed: same thank-you, no new email
  const before = await emailCount(reader);
  await page.goto(hostedUrl);
  await page.getByLabel("Email").fill(reader);
  await page.getByRole("button", { name: "Subscribe" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  expect(await emailCount(reader)).toBe(before);

  // Bots that fill the hidden field are quietly ignored
  const bot = uniqueEmail("bot");
  const publicId = hostedUrl.split("/f/")[1]!;
  const botResponse = await page.request.post(`/api/forms/${publicId}/subscribe`, {
    form: { email: bot, website: "http://spam.example" },
    maxRedirects: 0,
  });
  expect(botResponse.status()).toBe(303);
  await page.goto(`/w/${slug}/contacts?q=${encodeURIComponent(bot)}`);
  await expect(page.getByText("No subscribers match")).toBeVisible();

  // JSON for sites that post with fetch, with a clear error for a bad address
  const ok = await page.request.post(`/api/forms/${publicId}/subscribe`, {
    data: { email: uniqueEmail("json") },
  });
  expect(await ok.json()).toEqual({
    ok: true,
    message: "Almost done: check your inbox and confirm your subscription.",
  });
  const bad = await page.request.post(`/api/forms/${publicId}/subscribe`, {
    data: { email: "not-an-email" },
  });
  expect(bad.status()).toBe(422);
  expect(await bad.json()).toEqual({ ok: false, error: "Enter a valid email address." });

  // A tampered confirmation link is refused
  await page.goto(`${confirmUrl.slice(0, -4)}AAAA`);
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
});
