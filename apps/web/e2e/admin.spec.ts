import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections } from "./campaigns";
import { logIn, signUpWithWorkspace, uniqueEmail } from "./helpers";

test.afterAll(closeConnections);

test("a super-admin raises a limit, views the app as a customer, and suspends them", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  // The customer, in a browser of their own.
  const context = await browser.newContext();
  const customer = await context.newPage();
  const customerEmail = uniqueEmail("customer");
  const slug = await signUpWithWorkspace(customer, {
    name: "Casey Customer",
    email: customerEmail,
    workspace: `Customer ${Date.now()}`,
  });

  const adminEmail = uniqueEmail("admin");
  await signUpWithWorkspace(page, {
    name: "Sam Admin",
    email: adminEmail,
    workspace: `Admin ${Date.now()}`,
  });
  await getSql()`update users set role = 'admin' where email = ${adminEmail}`;

  await page.goto("/admin/customers");
  await page.getByLabel("Search customers").fill(customerEmail);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: customerEmail }).click();
  await expect(page.getByRole("heading", { name: customerEmail })).toBeVisible();

  // A bigger monthly allowance, just for them.
  await page.getByLabel("Emails a month").fill("25000");
  await page.getByRole("button", { name: "Save overrides" }).click();
  await expect(page.getByRole("status")).toHaveText("Overrides saved.");
  await customer.goto(`/w/${slug}/settings/billing`);
  await expect(customer.getByLabel("Usage")).toContainText("0 of 25,000");

  // Log in as them, then back.
  await page.getByRole("button", { name: "Log in as them" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}`));
  await expect(page.getByText("You're viewing Sendcoop as")).toContainText(
    `You're viewing Sendcoop as Casey Customer (${customerEmail}).`,
  );
  await page.getByRole("button", { name: "Stop viewing as them" }).click();
  await expect(page).toHaveURL(/\/admin\/customers$/);

  // Suspend: their session ends, they can't log in, and nothing can be sent.
  await page.goto(`/admin/customers`);
  await page.getByRole("link", { name: customerEmail }).click();
  await page.getByLabel("Reason for suspending").fill("Sending to a bought list.");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Suspend account" }).click();
  await expect(page.getByRole("status")).toContainText("Suspended.");
  await expect(page.getByRole("heading", { name: customerEmail })).toContainText("Suspended");

  await customer.goto(`/w/${slug}`);
  await expect(customer).toHaveURL(/\/login/);
  await logIn(customer, customerEmail);
  await expect(customer.getByText(/This account is suspended/)).toBeVisible();

  // Lifted: they can log in again.
  await page.getByRole("button", { name: "Lift the suspension" }).click();
  await expect(page.getByRole("status")).toHaveText("No longer suspended.");
  await logIn(customer, customerEmail);
  await expect(customer).toHaveURL(new RegExp(`/w/${slug}`));
  await context.close();
});

test("the admin area is hidden from customers", async ({ page }) => {
  await signUpWithWorkspace(page, {
    name: "Not Admin",
    email: uniqueEmail("not-admin"),
    workspace: `Plain ${Date.now()}`,
  });
  expect((await page.goto("/admin/customers"))?.status()).toBe(404);
});
