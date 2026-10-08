import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test.afterAll(closeConnections);

test("sidebar shows navigation to every section", async ({ page }) => {
  await signUpWithWorkspace(page, {
    name: "Nav User",
    email: uniqueEmail("nav"),
    workspace: "Nav Co",
  });
  const sidebar = page.locator("[data-sidebar=sidebar]");

  for (const item of ["Dashboard", "Contacts", "Lists", "Automations", "Revenue", "Integrations"]) {
    await expect(sidebar.getByRole("link", { name: item })).toBeVisible();
  }
});

test("switcher creates a second workspace (on a plan that allows it) and moves between them", async ({
  page,
}) => {
  const email = uniqueEmail("switch");
  const first = await signUpWithWorkspace(page, {
    name: "Switch User",
    email,
    workspace: `First ${Date.now()}`,
  });

  await page.getByRole("button", { name: "Switch workspace" }).click();
  await page.getByRole("menuitem", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/workspaces\/new/);
  await page.getByLabel("Workspace name").fill(`Second ${Date.now()}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  // The free plan has one workspace.
  await expect(page.getByText(/Your Free plan allows 1 workspace\./)).toBeVisible();

  await getSql()`
    insert into subscriptions (user_id, plan_id, status)
    select u.id, p.id, 'active' from users u, plans p where u.email = ${email} and p.key = 'starter'`;
  await page.getByLabel("Workspace name").fill(`Second ${Date.now()}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\/second-/);
  const second = new URL(page.url()).pathname.split("/")[2]!;

  // Both workspaces are listed; picking the first one opens it.
  await page.getByRole("button", { name: "Switch workspace" }).click();
  await expect(page.getByRole("menuitem")).toHaveCount(3); // 2 workspaces + create
  await page.getByRole("menuitem", { name: /^First/ }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${first}$`));

  // "/" returns to the workspace opened most recently.
  await page.goto(`/w/${second}`);
  await page.goto("/");
  await expect(page).toHaveURL(new RegExp(`/w/${second}$`));
});

test("dark mode can be switched on and is remembered", async ({ page }) => {
  await signUpWithWorkspace(page, {
    name: "Theme User",
    email: uniqueEmail("theme"),
    workspace: "Theme Co",
  });

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
});

test("signing out from the account menu ends the session", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Leaving User",
    email: uniqueEmail("signout"),
    workspace: "Leave Co",
  });

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto(`/w/${slug}`);
  await expect(page).toHaveURL(/\/login$/);
});
