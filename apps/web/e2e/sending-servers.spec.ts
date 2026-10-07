import { expect, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";
const SMTP_HOST = process.env.SMTP_HOST ?? "localhost";
const SMTP_PORT = process.env.SMTP_PORT ?? "1026";

test("a sending server delivers a DKIM-signed test email", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Server Owner",
    email: uniqueEmail("servers"),
    workspace: `Servers ${Date.now()}`,
  });

  // A sending domain to send from
  await page.goto(`/w/${slug}/settings/domains`);
  await page.getByLabel("Domain you send from").fill("mail.acme.test");
  await page.getByRole("button", { name: "Add domain" }).click();
  await expect(page).toHaveURL(/\/settings\/domains\/[0-9a-f-]+$/);

  await page.goto(`/w/${slug}/settings`);
  await page.getByRole("link", { name: /Sending servers/ }).click();
  await page.getByRole("link", { name: "Add server" }).click();

  // SES settings are checked
  await page.getByLabel("Name", { exact: true }).fill("Bad SES");
  await page.getByLabel("AWS region").fill("mars");
  await page.getByLabel("Access key ID").fill("AKIAEXAMPLEEXAMPLE");
  await page.getByLabel("Secret access key").fill("secretsecretsecretsecret");
  await page.getByRole("button", { name: "Add server" }).click();
  await expect(page.getByText("region: Choose an AWS region like us-east-1.")).toBeVisible();

  // An SMTP server (Mailpit in development)
  await page.getByLabel("Name", { exact: true }).fill("Local SMTP");
  await page.getByLabel("Type").selectOption("smtp");
  await page.getByLabel("Host").fill(SMTP_HOST);
  await page.getByLabel("Port", { exact: true }).fill(SMTP_PORT);
  await page.getByRole("button", { name: "Add server" }).click();
  await expect(page).toHaveURL(/\/settings\/servers\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Local SMTP" })).toBeVisible();

  // Send a test and find it in Mailpit, DKIM-signed by the domain
  const to = uniqueEmail("test-inbox");
  await page.getByLabel("From", { exact: true }).fill("news");
  await page.getByLabel("Send to").fill(to);
  await page.getByRole("button", { name: "Send test email" }).click();
  await expect(page.getByRole("status")).toHaveText(`Sent to ${to}. Check that inbox (and spam).`);

  const search = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
  ).then(
    (r) =>
      r.json() as Promise<{
        messages: { ID: string; Subject: string; From: { Address: string } }[];
      }>,
  );
  expect(search.messages[0]?.Subject).toMatch(/^Test email from Servers/);
  expect(search.messages[0]?.From.Address).toBe("news@mail.acme.test");
  const headers = await fetch(`${MAILPIT}/api/v1/message/${search.messages[0]!.ID}/headers`).then(
    (r) => r.json() as Promise<Record<string, string[]>>,
  );
  expect(headers["Dkim-Signature"]?.[0]).toMatch(/d=mail\.acme\.test; .*s=sc\d{6}/);

  // Renaming keeps the connection; the list shows no secrets
  await page.getByLabel("Name", { exact: true }).fill("Mailpit");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.getByRole("link", { name: "Sending servers" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Mailpit" })).toContainText(
    `${SMTP_HOST}:${SMTP_PORT}`,
  );
});
