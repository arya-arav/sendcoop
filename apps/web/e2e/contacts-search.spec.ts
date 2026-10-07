import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("subscribers can be searched, filtered and paged", async ({ page }) => {
  test.setTimeout(90_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Search Owner",
    email: uniqueEmail("search"),
    workspace: `Search ${Date.now()}`,
  });

  // 120 generated subscribers: names cycle through fixed pools, every 20th is
  // unsubscribed, and about 60% are on one of three "Seed: …" lists.
  execFileSync("pnpm", ["--filter", "@sendcoop/db", "seed:subscribers", slug, "120"], {
    cwd: "../..",
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  await page.goto(`/w/${slug}/contacts`);
  await expect(page.getByText("120 subscribers")).toBeVisible();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(50);

  // Paging: 50 + 50 + 20, and back again
  const firstOnPage1 = await rows.first().textContent();
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(rows.first()).not.toHaveText(firstOnPage1!);
  await expect(rows).toHaveCount(50);
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(rows).toHaveCount(20);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  // Wait for each page to arrive before clicking again.
  await page.getByRole("link", { name: "Previous", exact: true }).click();
  await expect(rows).toHaveCount(50);
  await page.getByRole("link", { name: "Previous", exact: true }).click();
  await expect(rows.first()).toHaveText(firstOnPage1!);
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();

  // Search updates the URL and the results as you type
  await page.getByLabel("Search subscribers").fill("PRIYA");
  await expect(page).toHaveURL(/q=PRIYA/);
  await expect(page.getByText(/match$/)).toHaveText(/^\d+ of 120 subscribers match$/);
  for (const text of await rows.allTextContents()) expect(text.toLowerCase()).toContain("priya");

  // Status filter combines with search
  await page.getByLabel("Filter by status").selectOption("unsubscribed");
  await expect(page).toHaveURL(/status=unsubscribed/);
  for (const text of await rows.allTextContents()) expect(text).toContain("Unsubscribed");

  // No matches
  await page.getByLabel("Search subscribers").fill("zzqxj-nobody");
  await expect(page.getByText("No subscribers match")).toBeVisible();

  // Clear brings everything back; then filter by list
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("120 subscribers")).toBeVisible();
  await expect(page.getByLabel("Search subscribers")).toHaveValue("");
  await page.getByLabel("Filter by list").selectOption({ label: "Seed: webinar leads" });
  await expect(page).toHaveURL(/list=/);
  for (const text of await rows.allTextContents()) expect(text).toContain("Seed: webinar leads");

  // The filtered view survives a reload (state is in the URL)
  await page.reload();
  await expect(page.getByLabel("Filter by list")).toHaveValue(/.+/);
  await expect(page.getByText(/of 120 subscribers match$/)).toBeVisible();

  // Nonsense in the URL is ignored, not an error
  await page.goto(`/w/${slug}/contacts?status=bogus&list=not-a-uuid&after=xyz`);
  await expect(page.getByText("120 subscribers")).toBeVisible();
});
