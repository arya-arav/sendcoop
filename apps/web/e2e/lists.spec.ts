import { expect, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("lists can be created, edited and deleted", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "List Owner",
    email: uniqueEmail("lists"),
    workspace: "Lists Co",
  });

  await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: "Lists" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/lists$`));
  await expect(page.getByText("No lists yet")).toBeVisible();

  // Create from the empty state
  await page.getByRole("button", { name: "Create your first list" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("ClickBank buyers");
  await dialog.getByLabel("Description").fill("Bought through the keto offer");
  await dialog.getByRole("button", { name: "Create list" }).click();
  await expect(dialog).toBeHidden();
  const rows = page.getByRole("row");
  await expect(rows.filter({ hasText: "ClickBank buyers" })).toContainText(
    "Bought through the keto offer",
  );

  // Names are unique per workspace, ignoring case
  await page.getByRole("button", { name: "New list" }).click();
  await dialog.getByLabel("Name").fill("clickbank BUYERS");
  await dialog.getByRole("button", { name: "Create list" }).click();
  await expect(dialog.getByText("A list with this name already exists.")).toBeVisible();
  await dialog.getByLabel("Name").fill("Webinar leads");
  await dialog.getByRole("button", { name: "Create list" }).click();
  await expect(dialog).toBeHidden();
  await expect(rows.filter({ hasText: "Webinar leads" })).toBeVisible();

  // Edit
  await page.getByRole("button", { name: "Actions for ClickBank buyers" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(dialog.getByLabel("Name")).toHaveValue("ClickBank buyers");
  await dialog.getByLabel("Name").fill("ClickBank buyers 2026");
  await dialog.getByLabel("Description").fill("");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await expect(rows.filter({ hasText: "ClickBank buyers 2026" })).not.toContainText("keto");

  // Delete, after confirming
  await page.getByRole("button", { name: "Actions for Webinar leads" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Delete “Webinar leads”?");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(rows.filter({ hasText: "Webinar leads" })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Webinar leads" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Delete list" }).click();
  await expect(confirm).toBeHidden();
  await expect(rows.filter({ hasText: "Webinar leads" })).toHaveCount(0);

  // Changes survive a reload
  await page.reload();
  await expect(rows.filter({ hasText: "ClickBank buyers 2026" })).toBeVisible();
  await expect(rows).toHaveCount(2); // header + one list
});
