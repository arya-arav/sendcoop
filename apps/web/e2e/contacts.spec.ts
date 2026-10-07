import { expect, type Page, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

async function createList(page: Page, slug: string, name: string) {
  await page.goto(`/w/${slug}/lists`);
  await page.getByRole("button", { name: /New list|Create your first list/ }).click();
  await page.getByRole("dialog").getByLabel("Name").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Create list" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("subscribers can be added and viewed", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Contact Owner",
    email: uniqueEmail("contacts"),
    workspace: "Contacts Co",
  });
  await createList(page, slug, "Keto buyers");
  await createList(page, slug, "Webinar leads");

  await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: "Contacts" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/contacts$`));
  await expect(page.getByText("No subscribers yet")).toBeVisible();

  // Add one, on two lists
  await page.getByRole("button", { name: "Add your first subscriber" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("  Priya.Sharma@Example.com ");
  await dialog.getByLabel("First name").fill("Priya");
  await dialog.getByLabel("Last name").fill("Sharma");
  await dialog.getByLabel("Keto buyers").check();
  await dialog.getByLabel("Webinar leads").check();
  await dialog.getByRole("button", { name: "Add subscriber" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("row").filter({ hasText: "priya.sharma@example.com" });
  await expect(row).toContainText("Priya Sharma");
  await expect(row).toContainText("Subscribed");
  await expect(row).toContainText("Keto buyers");
  await expect(row).toContainText("Webinar leads");
  await expect(page.getByText("1 subscriber", { exact: true })).toBeVisible();

  // Same address in another letter case is a duplicate
  await page.getByRole("button", { name: "Add subscriber" }).click();
  await dialog.getByLabel("Email").fill("PRIYA.SHARMA@example.com");
  await dialog.getByRole("button", { name: "Add subscriber" }).click();
  await expect(dialog.getByText("This email is already a subscriber.")).toBeVisible();

  // A second subscriber with no name or lists appears first (newest first)
  await dialog.getByLabel("Email").fill("lead@example.com");
  await dialog.getByRole("button", { name: "Add subscriber" }).click();
  await expect(dialog).toBeHidden();
  const rows = page.getByRole("row");
  await expect(rows.nth(1)).toContainText("lead@example.com");
  await expect(rows.nth(2)).toContainText("priya.sharma@example.com");
  await expect(page.getByText("2 subscribers", { exact: true })).toBeVisible();

  // Counts show up on the lists page and the dashboard
  await page.goto(`/w/${slug}/lists`);
  await expect(page.getByRole("row").filter({ hasText: "Keto buyers" })).toContainText("1");
  await page.goto(`/w/${slug}`);
  await expect(page.locator("[data-slot=card]").filter({ hasText: "Subscribers" })).toContainText(
    "2",
  );
});
