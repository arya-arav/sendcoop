import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const KEY = `e2e-${Date.now().toString(36)}`;

test.afterAll(async () => {
  await getSql()`delete from plans where key = ${KEY}`;
  await closeConnections();
});

test("a super-admin adds a plan, and customers see it on their billing page", async ({ page }) => {
  const email = uniqueEmail("plans");
  const slug = await signUpWithWorkspace(page, {
    name: "Plan Keeper",
    email,
    workspace: `Plans ${Date.now()}`,
  });

  await page.goto(`/w/${slug}/settings`);
  await page.getByRole("link", { name: /Billing/ }).click();
  await expect(page.getByRole("heading", { name: "Free", level: 2 })).toBeVisible();
  await expect(page.getByRole("table", { name: "Plans" })).toContainText("Growth");

  // Only super-admins reach /admin.
  const denied = await page.goto("/admin/plans");
  expect(denied?.status()).toBe(404);
  await getSql()`update users set is_super_admin = true where email = ${email}`;

  await page.goto("/admin/plans");
  await page.getByRole("link", { name: "New plan" }).click();
  await page.getByLabel("Name").fill("Agency");
  await page.getByLabel("Key").fill(KEY);
  await page.getByLabel("Price a month").fill("299");
  await page.getByLabel("Subscribers").fill("");
  await page.getByLabel("API and webhooks").check();
  await page.getByLabel("Order").fill("50");
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page).toHaveURL(/\/admin\/plans$/);
  await expect(page.getByRole("link", { name: "Agency" })).toBeVisible();

  await page.goto(`/w/${slug}/settings/billing`);
  const table = page.getByRole("table", { name: "Plans" });
  await expect(table).toContainText("Agency");
  await expect(table).toContainText("$299.00 a month");
  await expect(table).toContainText("Unlimited");
});
