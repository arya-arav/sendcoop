import { expect, test } from "@playwright/test";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

test.afterAll(closeConnections);

test("a campaign starts from a gallery starter and arrives personalized", async ({ page }) => {
  test.setTimeout(60_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Shop Owner",
    email: uniqueEmail("gallery"),
    workspace: `Gallery ${Date.now()}`,
  });

  // The gallery: ten starters plus a blank one, filterable by category
  await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: "Templates" }).click();
  await page.getByRole("link", { name: "Create your first template" }).click();
  await expect(page.getByRole("heading", { name: "New template" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Use this starter: / })).toHaveCount(10);
  await page
    .getByRole("navigation", { name: "Categories" })
    .getByRole("link", { name: "Ecommerce" })
    .click();
  await expect(page.getByRole("button", { name: /^Use this starter: / })).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Abandoned cart" })).toBeVisible();

  // Use one: it opens in the editor with its suggested subject
  await page.getByRole("button", { name: "Use this starter: Abandoned cart" }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]+$/);
  await expect(page.getByRole("status")).toHaveText("All changes saved", { timeout: 20_000 });
  await expect(page.getByLabel("Template name")).toHaveValue("Abandoned cart");
  await expect(page.getByLabel("Subject line")).toHaveValue(
    "{{first_name | You}}, you left something in your cart",
  );
  await expect(page.frameLocator(".gjs-frame").getByText("Still thinking it over?")).toBeVisible();
  const templateId = page.url().split("/").pop()!;

  // A campaign from the template (the campaign builder arrives in D31)
  const rita = uniqueEmail("gallery-rita");
  await sendCampaign(slug, [{ email: rita, firstName: "Rita" }], { templateId });

  let message: { Subject: string; HTML: string; Text: string } | undefined;
  await expect
    .poll(
      async () => {
        const found = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${rita}"`)}`,
        ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
        const id = found.messages?.[0]?.ID;
        if (!id) return false;
        message = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
        return true;
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  expect(message!.Subject).toBe("Rita, you left something in your cart");
  expect(message!.HTML).toContain("Hi Rita, you left this in your cart.");
  expect(message!.HTML).toContain("Complete checkout");
  // The starter's own unsubscribe link, filled in (no extra footer).
  expect(message!.HTML).toMatch(/<a href="http[^"]+\/u\/[^"]+"[^>]*>Unsubscribe<\/a>/);
  expect(message!.HTML).not.toContain("{{");
  expect(message!.Text).toContain("Hi Rita, you left this in your cart.");
});
