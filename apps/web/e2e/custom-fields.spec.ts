import { expect, type Page, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

async function createField(
  page: Page,
  { label, type, options }: { label: string; type?: string; options?: string },
) {
  await page.getByRole("button", { name: /New field|Create your first field/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Label").fill(label);
  if (type) await dialog.getByLabel("Type").selectOption(type);
  if (options) await dialog.getByLabel("Options").fill(options);
  await dialog.getByRole("button", { name: "Create field" }).click();
}

test("custom fields are managed and show on the subscriber form", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Field Owner",
    email: uniqueEmail("fields"),
    workspace: "Fields Co",
  });
  await page.goto(`/w/${slug}/contacts`);
  await page.getByRole("link", { name: "Custom fields" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/contacts/fields$`));
  await expect(page.getByText("No custom fields yet")).toBeVisible();
  const dialog = page.getByRole("dialog");

  // The key follows the label until edited, and shows as a merge tag
  await page.getByRole("button", { name: "Create your first field" }).click();
  await dialog.getByLabel("Label").fill("Company name");
  await expect(dialog.getByLabel("Key")).toHaveValue("company_name");
  await expect(dialog.getByText("{{company_name}}")).toBeVisible();
  await dialog.getByRole("button", { name: "Create field" }).click();
  await expect(dialog).toBeHidden();

  await createField(page, { label: "Lead score", type: "number" });
  await expect(dialog).toBeHidden();
  await createField(page, { label: "Signup date", type: "date" });
  await expect(dialog).toBeHidden();

  // Dropdowns need options
  await createField(page, { label: "Plan", type: "dropdown" });
  await expect(dialog.getByText("Add at least one option, one per line.")).toBeVisible();
  await dialog.getByLabel("Options").fill("Starter\nPro\n\npro");
  await dialog.getByRole("button", { name: "Create field" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: "Plan" })).toContainText("Starter");

  // Reserved and duplicate keys are refused
  await createField(page, { label: "Email" });
  await expect(dialog.getByText("“email” is reserved. Choose another key.")).toBeVisible();
  await dialog.getByLabel("Key").fill("lead_score");
  await dialog.getByRole("button", { name: "Create field" }).click();
  await expect(dialog.getByText("Another field already uses this key.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Editing: key and type are locked, options can grow
  await page.getByRole("button", { name: "Actions for Plan" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(dialog.getByLabel("Key")).toHaveAttribute("readonly", "");
  await expect(dialog.getByLabel("Type")).toBeDisabled();
  await dialog.getByLabel("Options").fill("Starter\nPro\nAgency");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: "Plan" })).toContainText("Agency");

  // The fields appear on the subscriber form, with inputs matching their types
  await page.getByRole("main").getByRole("link", { name: "Contacts" }).click();
  await page.getByRole("button", { name: "Add your first subscriber" }).click();
  await expect(dialog.getByLabel("Company name")).toHaveAttribute("maxlength", "500");
  await expect(dialog.getByLabel("Lead score")).toHaveAttribute("type", "number");
  await expect(dialog.getByLabel("Signup date")).toHaveAttribute("type", "date");
  await expect(dialog.getByLabel("Plan").locator("option")).toHaveText([
    "—",
    "Starter",
    "Pro",
    "Agency",
  ]);

  await dialog.getByLabel("Email").fill("buyer@example.com");
  await dialog.getByLabel("Company name").fill("Acme");
  await dialog.getByLabel("Lead score").fill("87");
  await dialog.getByLabel("Signup date").fill("2026-10-08");
  await dialog.getByLabel("Plan").selectOption("Agency");
  await dialog.getByRole("button", { name: "Add subscriber" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: "buyer@example.com" })).toBeVisible();

  // Deleting a field removes it from the form
  await page.getByRole("link", { name: "Custom fields" }).click();
  await page.getByRole("button", { name: "Actions for Lead score" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete field" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Lead score" })).toHaveCount(0);

  await page.getByRole("main").getByRole("link", { name: "Contacts" }).click();
  await page.getByRole("button", { name: "Add subscriber" }).click();
  await expect(dialog.getByLabel("Company name")).toBeVisible();
  await expect(dialog.getByLabel("Lead score")).toHaveCount(0);
});
