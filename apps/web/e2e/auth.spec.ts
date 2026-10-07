import { expect, test } from "@playwright/test";
import {
  logIn,
  PASSWORD,
  signUp,
  signUpWithWorkspace,
  uniqueEmail,
  verificationLink,
} from "./helpers";

test("logged-out visitors are sent to log in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("new user signs up, confirms email and lands in their own workspace", async ({ page }) => {
  const email = uniqueEmail("signup");
  await signUp(page, { name: "Priya Test", email });
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  // The confirmation link signs them in and continues to onboarding.
  await page.goto(await verificationLink(email));
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByLabel("Workspace name")).toHaveValue("Priya's workspace");

  await page.getByLabel("Workspace name").fill("Acme Growth");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\/acme-growth/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch workspace" })).toContainText("owner");

  // With a workspace, "/" and onboarding both lead back to it.
  const workspaceUrl = page.url();
  await page.goto("/");
  await expect(page).toHaveURL(workspaceUrl);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(workspaceUrl);
});

test("unverified users are sent back to the confirmation page", async ({ page }) => {
  const email = uniqueEmail("unverified");
  await signUp(page, { name: "Not Verified", email });
  await logIn(page, email);
  await expect(page).toHaveURL(/\/verify-email/);
});

test("wrong password shows an error, right password logs in", async ({ page }) => {
  const email = uniqueEmail("password");
  const slug = await signUpWithWorkspace(page, { name: "Pat", email, workspace: "Pat Co" });
  await page.context().clearCookies();

  await logIn(page, email, "wrong-password");
  await expect(page.locator("form [role=alert]")).toHaveText("Wrong email or password.");

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}$`));
});

test("workspaces are private to their members", async ({ browser }) => {
  const owner = await browser.newPage();
  const name = `Shared Name ${Date.now()}`;
  const ownerSlug = await signUpWithWorkspace(owner, {
    name: "Owner",
    email: uniqueEmail("owner"),
    workspace: name,
  });

  // A second user picking the same name gets a different address...
  const other = await browser.newPage();
  const otherSlug = await signUpWithWorkspace(other, {
    name: "Other",
    email: uniqueEmail("other"),
    workspace: name,
  });
  expect(otherSlug).not.toBe(ownerSlug);
  expect(otherSlug.startsWith(ownerSlug)).toBe(true);

  // ...and can't open the first user's workspace.
  const response = await other.goto(`/w/${ownerSlug}`);
  expect(response?.status()).toBe(404);
});
