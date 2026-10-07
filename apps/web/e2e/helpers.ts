import { expect, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";
export const PASSWORD = "correct-horse-42";

/** A unique address per test run, so tests can run in parallel against one database. */
export function uniqueEmail(label: string) {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

/** Polls Mailpit for the newest verification link sent to `to`. */
export async function verificationLink(to: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        ).then((r) => r.json());
        const id = search.messages?.[0]?.ID;
        if (!id) return undefined;
        const message = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
        link = message.Text.match(/https?:\/\/\S+verify-email\S+/)?.[0];
        return link;
      },
      { message: `verification email for ${to}`, timeout: 15_000 },
    )
    .toBeTruthy();
  return link!;
}

export async function signUp(page: Page, { name, email }: { name: string; email: string }) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
}

/** Signs up, confirms the email and creates a workspace. Returns its slug. */
export async function signUpWithWorkspace(
  page: Page,
  { name, email, workspace }: { name: string; email: string; workspace: string },
): Promise<string> {
  await signUp(page, { name, email });
  await page.goto(await verificationLink(email));
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Workspace name").fill(workspace);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\/[^/]+$/);
  return new URL(page.url()).pathname.split("/")[2]!;
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** Newest link matching `pattern` in an email to `to`, waiting for it to arrive. */
export async function emailLink(to: string, pattern: RegExp): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        ).then((r) => r.json());
        const id = search.messages?.[0]?.ID;
        if (!id) return undefined;
        const message = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
        link = message.Text.match(pattern)?.[0];
        return link;
      },
      { message: `email to ${to}`, timeout: 15_000 },
    )
    .toBeTruthy();
  return link!;
}

/** How many emails have been sent to `to`. */
export async function emailCount(to: string): Promise<number> {
  const search = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
  ).then((r) => r.json());
  return search.messages_count ?? 0;
}
