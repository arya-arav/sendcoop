import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("bulk actions work on checked rows and on everyone matching", async ({ page }) => {
  test.setTimeout(90_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Bulk Owner",
    email: uniqueEmail("bulk"),
    workspace: `Bulk ${Date.now()}`,
  });
  execFileSync("pnpm", ["--filter", "@sendcoop/db", "seed:subscribers", slug, "120"], {
    cwd: "../..",
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  await page.goto(`/w/${slug}/contacts`);
  await expect(page.getByText("120 subscribers")).toBeVisible();
  const rows = page.locator("tbody tr");
  const toolbar = page.getByRole("toolbar", { name: "Bulk actions" });
  const dialog = page.getByRole("dialog");
  const notice = page.getByRole("status").filter({ hasText: /\./ });

  // Tag two checked rows with a new tag
  const first = (await rows.nth(0).locator("td").nth(1).textContent())!;
  const second = (await rows.nth(1).locator("td").nth(1).textContent())!;
  await page.getByLabel(`Select ${first}`).check();
  await page.getByLabel(`Select ${second}`).check();
  await expect(toolbar).toContainText("2 subscribers selected");
  await toolbar.getByRole("button", { name: "Add tag" }).click();
  await dialog.getByLabel("Tag").fill("VIP");
  await dialog.getByRole("button", { name: "Add tag" }).click();
  await expect(notice).toHaveText("Tagged 2 subscribers with “VIP”.");
  await expect(toolbar).toBeHidden(); // selection clears after an action
  await expect(rows.nth(0)).toContainText("VIP");

  // The tag filter finds them
  await page.getByLabel("Filter by tag").selectOption({ label: "VIP" });
  await expect(page.getByText("2 of 120 subscribers match")).toBeVisible();

  // Remove the tag from one of them
  await page.getByLabel(`Select ${first}`).check();
  await toolbar.getByRole("button", { name: "Remove tag" }).click();
  await dialog.getByLabel("Tag").selectOption({ label: "VIP" });
  await dialog.getByRole("button", { name: "Remove tag" }).click();
  await expect(notice).toHaveText("Removed “VIP” from 1 subscriber.");
  await expect(page.getByText("1 of 120 subscribers match")).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("120 subscribers", { exact: true })).toBeVisible();

  // Select all on the page, then everyone matching, and add them to a list
  await page.getByLabel("Select all on this page").check();
  await expect(toolbar).toContainText("50 subscribers selected");
  await page.getByRole("button", { name: "Select all 120 matching" }).click();
  await expect(toolbar).toContainText("120 subscribers selected");
  await toolbar.getByRole("button", { name: "Add to list" }).click();
  await dialog.getByLabel("List").selectOption({ label: "Seed: newsletter" });
  await dialog.getByRole("button", { name: "Add to list" }).click();
  await expect(notice).toHaveText(/^Added \d+ subscribers to “Seed: newsletter”\.$/);
  await page.getByLabel("Filter by list").selectOption({ label: "Seed: newsletter" });
  await expect(page.getByText("120 of 120 subscribers match")).toBeVisible();

  // Move everyone on one list to another
  await page.getByLabel("Filter by list").selectOption({ label: "Seed: keto buyers" });
  // Wait for the keto results to replace the newsletter ones (120 of 120).
  const summary = page.getByText(/^\d+ of 120 subscribers match$/);
  await expect(summary).not.toHaveText("120 of 120 subscribers match");
  await page.getByLabel("Select all on this page").check();
  const matchAll = page.getByRole("button", { name: /^Select all \d+ matching$/ });
  if (await matchAll.isVisible()) await matchAll.click();
  await toolbar.getByRole("button", { name: "Move to list" }).click();
  await dialog.getByLabel("Move to").selectOption({ label: "Seed: webinar leads" });
  await dialog.getByRole("button", { name: "Move" }).click();
  await expect(notice).toHaveText(/^Moved \d+ subscribers? to “Seed: webinar leads”\.$/);
  await expect(page.getByText("No subscribers match")).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("120 subscribers", { exact: true })).toBeVisible();

  // Selection resets when moving to another page
  await page.getByLabel(`Select ${first}`).check();
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(toolbar).toBeHidden();
  await page.getByRole("link", { name: "Previous", exact: true }).click();

  // Unsubscribe one (the seed data makes the first row already unsubscribed)
  await expect(rows.filter({ hasText: second }).locator("td").nth(3)).toHaveText("Subscribed");
  await page.getByLabel(`Select ${second}`).check();
  await toolbar.getByRole("button", { name: "Unsubscribe" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Unsubscribe" }).click();
  await expect(notice).toHaveText(
    "Unsubscribed 1 subscriber. They won't receive campaigns from this workspace.",
  );
  await expect(rows.filter({ hasText: second })).toContainText("Unsubscribed");

  // Delete two, after confirming
  await page.getByLabel(`Select ${first}`).check();
  await page.getByLabel(`Select ${second}`).check();
  await toolbar.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete 2 subscribers" }).click();
  await expect(notice).toHaveText("Deleted 2 subscribers.");
  await expect(page.getByText("118 subscribers")).toBeVisible();
  await expect(rows.filter({ hasText: first })).toHaveCount(0);
});
