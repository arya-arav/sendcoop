import { expect, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("segments are built from conditions and groups, saved and reloaded", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Segment Owner",
    email: uniqueEmail("segments"),
    workspace: "Segments Co",
  });
  const dialog = page.getByRole("dialog");

  // A list and a number field to build rules on
  await page.goto(`/w/${slug}/lists`);
  await page.getByRole("button", { name: "Create your first list" }).click();
  await dialog.getByLabel("Name").fill("Keto buyers");
  await dialog.getByRole("button", { name: "Create list" }).click();
  await expect(dialog).toBeHidden();
  await page.goto(`/w/${slug}/contacts/fields`);
  await page.getByRole("button", { name: "Create your first field" }).click();
  await dialog.getByLabel("Label").fill("Lead score");
  await dialog.getByLabel("Type").selectOption("number");
  await dialog.getByRole("button", { name: "Create field" }).click();
  await expect(dialog).toBeHidden();

  await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: "Segments" }).click();
  await expect(page.getByText("No segments yet")).toBeVisible();
  await page.getByRole("link", { name: "Create your first segment" }).click();

  // Nothing to save until there's a name and a condition
  const save = page.getByRole("button", { name: "Save segment" });
  await expect(save).toBeDisabled();
  await page.getByLabel("Segment name").fill("Hot keto leads");
  await expect(save).toBeDisabled();

  // Condition 1: on the Keto buyers list
  await page.getByRole("button", { name: "Add condition" }).click();
  const conditions = page.getByRole("group", { name: "Condition" });
  await conditions.nth(0).getByLabel("Condition on").selectOption("list");
  await expect(conditions.nth(0).getByLabel("List")).toHaveValue(/.+/);

  // Condition 2: added in the last 30 days; a value is required
  await page.getByRole("button", { name: "Add condition" }).click();
  await conditions.nth(1).getByLabel("Condition on").selectOption("field:created_at");
  await conditions.nth(1).getByLabel("Comparison").selectOption("in_last_days");
  await expect(
    page.getByText("Enter a value for “Date added is in the last … days”."),
  ).toBeVisible();
  await expect(save).toBeDisabled();
  await conditions.nth(1).getByLabel("Value").fill("30");

  // A group: lead score above 50 OR email ends with @gmail.com
  await page.getByRole("button", { name: "Add group" }).click();
  const group = page.getByRole("group", { name: "Group" });
  const inGroup = group.getByRole("group", { name: "Condition" });
  await inGroup.nth(0).getByLabel("Condition on").selectOption("field:custom:lead_score");
  await inGroup.nth(0).getByLabel("Comparison").selectOption("gt");
  await inGroup.nth(0).getByLabel("Value").fill("50");
  await group.getByRole("button", { name: "Add condition to group" }).click();
  await inGroup.nth(1).getByLabel("Comparison").selectOption("ends_with");
  await inGroup.nth(1).getByLabel("Value").fill("@gmail.com");
  await expect(group.getByLabel("Match: all or any")).toHaveValue("any");

  await save.click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/segments/[0-9a-f-]+$`));
  await expect(page.getByRole("heading", { name: "Hot keto leads" })).toBeVisible();

  // Everything comes back after a reload
  await page.reload();
  await expect(conditions).toHaveCount(4);
  await expect(conditions.nth(1).getByLabel("Value")).toHaveValue("30");
  await expect(inGroup.nth(0).getByLabel("Value")).toHaveValue("50");
  await expect(inGroup.nth(1).getByLabel("Value")).toHaveValue("@gmail.com");

  // Edit: remove the date condition and save
  await conditions.nth(1).getByRole("button", { name: "Remove condition" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  // Names are unique
  await page.goto(`/w/${slug}/segments/new`);
  await page.getByLabel("Segment name").fill("hot keto LEADS");
  await page.getByRole("button", { name: "Add condition" }).click();
  await conditions.nth(0).getByLabel("Value").fill("x");
  await page.getByRole("button", { name: "Save segment" }).click();
  await expect(page.getByText("A segment with this name already exists.")).toBeVisible();

  // Listed, then deleted
  await page.goto(`/w/${slug}/segments`);
  const row = page.getByRole("row").filter({ hasText: "Hot keto leads" });
  await expect(row).toContainText("3 conditions, matching all");
  await row.getByRole("button", { name: "Delete Hot keto leads" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete segment" }).click();
  await expect(page.getByText("No segments yet")).toBeVisible();
});
