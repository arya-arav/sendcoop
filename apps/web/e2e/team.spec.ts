import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections } from "./campaigns";
import { emailLink, PASSWORD, signUpWithWorkspace, uniqueEmail, verificationLink } from "./helpers";

test.afterAll(closeConnections);

test("an invited member joins with view-only permissions, until made an admin", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const ownerEmail = uniqueEmail("team-owner");
  const slug = await signUpWithWorkspace(page, {
    name: "Team Owner",
    email: ownerEmail,
    workspace: `Team ${Date.now()}`,
  });
  const invitee = uniqueEmail("team-member");

  // The free plan is one person: inviting needs a plan with room.
  await page.goto(`/w/${slug}/settings`);
  await page.getByRole("link", { name: /Team/ }).click();
  await page.getByLabel("Email").fill(invitee);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/Your Free plan allows 1 person/)).toBeVisible();
  await getSql()`
    insert into subscriptions (user_id, plan_id, status)
    select u.id, p.id, 'active' from users u, plans p
    where u.email = ${ownerEmail} and p.key = 'starter'`;

  await page.getByLabel("Email").fill(invitee);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status")).toHaveText(`Invitation sent to ${invitee}.`);
  const team = page.getByRole("table", { name: "Team members" });
  await expect(team).toContainText(invitee);
  await expect(team).toContainText("Invited");

  // The invitee signs up from the email and joins.
  const link = await emailLink(invitee, /http:\/\/localhost:3000\/invite\/\S+/);
  const context = await browser.newContext();
  const member = await context.newPage();
  await member.goto(link);
  await expect(member.getByRole("heading", { name: /^Join Team/ })).toBeVisible();
  await member.getByRole("link", { name: "Create an account" }).click();
  await expect(member.getByLabel("Work email")).toHaveValue(invitee);
  await member.getByLabel("Your name").fill("Robin Member");
  await member.getByLabel("Password").fill(PASSWORD);
  await member.getByRole("button", { name: "Create account" }).click();
  await expect(member).toHaveURL(/\/verify-email/);
  await member.goto(await verificationLink(invitee));
  await expect(member).toHaveURL(/\/invite\//);
  await member.getByRole("button", { name: "Join the workspace" }).click();
  await expect(member).toHaveURL(new RegExp(`/w/${slug}$`));

  // View only: lists can be seen but not created, and the team not managed.
  await member.goto(`/w/${slug}/lists`);
  await expect(member.getByRole("heading", { name: "Lists", level: 1 })).toBeVisible();
  await expect(member.getByText("An owner or admin can create the first list.")).toBeVisible();
  await expect(member.getByRole("button", { name: "Create your first list" })).toHaveCount(0);
  await member.goto(`/w/${slug}/settings/team`);
  await expect(member.getByRole("button", { name: "Send invitation" })).toHaveCount(0);

  // The owner makes them an admin: now they can.
  await page.reload();
  await expect(team).toContainText("Robin Member");
  await page.getByLabel("Role for Robin Member").selectOption("admin");
  await expect(page.getByLabel("Role for Robin Member")).toHaveValue("admin");
  await member.goto(`/w/${slug}/lists`);
  await expect(member.getByRole("button", { name: "Create your first list" })).toBeVisible();

  // Removed: the workspace is gone for them.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove Robin Member" }).click();
  await expect(team).not.toContainText("Robin Member");
  const gone = await member.goto(`/w/${slug}/lists`);
  expect(gone?.status()).toBe(404);
  await context.close();
});
