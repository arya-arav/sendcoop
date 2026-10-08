import { expect, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("a test conversion from settings shows up in under 2 seconds", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Setup Checker",
    email: uniqueEmail("pbtest"),
    workspace: `Postback test ${Date.now()}`,
  });
  await page.goto(`/w/${slug}/settings/tracking`);
  const recent = page.locator("[data-slot=card]", { hasText: "Recent conversions" });
  await expect(recent.getByText("No conversions yet.")).toBeVisible();

  const started = Date.now();
  await recent.getByRole("button", { name: "Send a test conversion" }).click();
  const row = recent.getByRole("row").filter({ hasText: "Test" });
  await expect(row).toBeVisible({ timeout: 2_000 });
  expect(Date.now() - started).toBeLessThan(2_000);

  await expect(recent.getByRole("status")).toHaveText(/Test conversion recorded in \d+ ms\./);
  await expect(row).toContainText("$1.00");
  await expect(row).toContainText(/approved/i);
  await expect(row).toContainText("No email");
  // A second test is a new conversion, not a duplicate
  await recent.getByRole("button", { name: "Send a test conversion" }).click();
  await expect(recent.getByRole("row").filter({ hasText: "Test" })).toHaveCount(2);
});
