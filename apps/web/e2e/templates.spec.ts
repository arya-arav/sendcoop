import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("a template is designed in the visual editor, saved and reloaded", async ({ page }) => {
  test.setTimeout(60_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Designer",
    email: uniqueEmail("templates"),
    workspace: `Templates ${Date.now()}`,
  });

  await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: "Templates" }).click();
  await expect(page.getByText("No templates yet")).toBeVisible();
  await page.getByRole("button", { name: "Create your first template" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/templates/[0-9a-f-]+$`));
  const status = page.getByRole("status");
  await expect(status).toHaveText("All changes saved", { timeout: 20_000 });

  // Edit the text right on the canvas, and name the template
  const canvas = page.frameLocator(".gjs-frame");
  await canvas.getByText("Your headline").dblclick();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Summer sale starts Friday");
  await page.getByLabel("Template name").fill("Summer promo");

  // Add a product block from the panel (clicking adds it after the selected section)
  await expect(page.locator(".gjs-block", { hasText: "Footer" })).toBeVisible();
  await page.locator(".gjs-block", { hasText: "Product" }).click();
  await expect(canvas.getByText("Buy now")).toBeVisible();
  await expect(status).toHaveText("Unsaved changes");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(status).toHaveText("All changes saved");
  const templateId = page.url().split("/").pop()!;

  // Reloading brings back the design and the name
  await page.reload();
  await expect(status).toHaveText("All changes saved", { timeout: 20_000 });
  await expect(page.getByLabel("Template name")).toHaveValue("Summer promo");
  await expect(canvas.getByText("Summer sale starts Friday")).toBeVisible();

  // The list shows it
  await page.getByRole("link", { name: "Back to templates" }).click();
  const row = page.getByRole("row").filter({ hasText: "Summer promo" });
  await expect(row).toContainText("Drag and drop");

  // What gets sent is compiled MJML (table layout for Outlook) plus a text version
  const [saved] = await getSql()<{ html: string; text: string }[]>`
    select html, text from templates where id = ${templateId}`;
  expect(saved!.html).toContain("Summer sale starts Friday");
  expect(saved!.html).toMatch(/<table[^>]*role="presentation"/);
  expect(saved!.html).toContain("Buy now");
  expect(saved!.text).toContain("Summer sale starts Friday");
  expect(saved!.text).toContain("Buy now (https://example.com/product)");

  // The preview shows it at both sizes, with the checks passing
  await page.getByRole("link", { name: "Summer promo" }).click();
  await page.getByRole("link", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { name: "Summer promo" })).toBeVisible();
  for (const check of ["Size", "Outlook", "Image descriptions", "Unsubscribe link"]) {
    await expect(page.getByRole("heading", { name: check })).toBeVisible();
  }
  await expect(page.getByLabel("Needs attention")).toHaveCount(0);
  await expect(
    page.frameLocator('iframe[title="Phone preview"]').getByText("Summer sale starts Friday"),
  ).toBeVisible();
  await expect(page.getByText("Unsubscribe ({{unsubscribe_url}})")).toBeVisible();
});
