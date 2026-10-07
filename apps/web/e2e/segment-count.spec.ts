import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("segments count live and work as a Contacts filter and bulk selection", async ({ page }) => {
  test.setTimeout(90_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Count Owner",
    email: uniqueEmail("segment-count"),
    workspace: `Count ${Date.now()}`,
  });
  // 120 seeded subscribers: every 20th is unsubscribed (6 of them); domains cycle
  // through 6 providers, so gmail.com is every 6th.
  execFileSync("pnpm", ["--filter", "@sendcoop/db", "seed:subscribers", slug, "120"], {
    cwd: "../..",
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  await page.goto(`/w/${slug}/segments/new`);
  const count = page
    .getByRole("heading", { level: 3 })
    .or(page.locator("[data-slot=card-title]"))
    .first();
  await page.getByLabel("Segment name").fill("Lapsed gmail");
  await page.getByRole("button", { name: "Add condition" }).click();
  const conditions = page.getByRole("group", { name: "Condition" });
  await conditions.nth(0).getByLabel("Condition on").selectOption("field:status");
  await conditions.nth(0).getByLabel("Value").selectOption("unsubscribed");
  await expect(count).toHaveText("6");

  // Narrowing the rules updates the count
  await page.getByRole("button", { name: "Add condition" }).click();
  await conditions.nth(1).getByLabel("Comparison").selectOption("ends_with");
  await conditions.nth(1).getByLabel("Value").fill("@gmail.com");
  // Unsubscribed rows are 20, 40 … 120; gmail.com is every 6th (g % 6 == 0): 60 and 120.
  await expect(count).toHaveText("2");

  await page.getByRole("button", { name: "Save segment" }).click();
  await expect(page).toHaveURL(/\/segments\/[0-9a-f-]+$/);
  await expect(page.getByRole("link", { name: "View all in Contacts" })).toBeVisible();

  // The list shows the same count
  await page.goto(`/w/${slug}/segments`);
  await expect(page.getByRole("row").filter({ hasText: "Lapsed gmail" })).toContainText("2");

  // Clicking it opens Contacts filtered by the segment
  await page
    .getByRole("row")
    .filter({ hasText: "Lapsed gmail" })
    .getByRole("link", { name: "2" })
    .click();
  await expect(page.getByText("2 of 120 subscribers match")).toBeVisible();
  await expect(page.getByLabel("Filter by segment")).toHaveValue(/.+/);

  // Bulk actions apply to the segment
  await page.getByLabel("Select all on this page").check();
  const toolbar = page.getByRole("toolbar", { name: "Bulk actions" });
  await toolbar.getByRole("button", { name: "Add tag" }).click();
  await page.getByRole("dialog").getByLabel("Tag").fill("win-back");
  await page.getByRole("dialog").getByRole("button", { name: "Add tag" }).click();
  await expect(page.getByRole("status").filter({ hasText: /\./ })).toHaveText(
    "Tagged 2 subscribers with “win-back”.",
  );
});
