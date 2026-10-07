import { expect, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("a sending domain gets SPF, DKIM and DMARC records to copy", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signUpWithWorkspace(page, {
    name: "Domain Owner",
    email: uniqueEmail("domains"),
    workspace: "Domains Co",
  });

  await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: /Sending domains/ }).click();
  const input = page.getByLabel("Domain you send from");
  const add = page.getByRole("button", { name: "Add domain" });

  // Free mailbox domains and nonsense are refused
  await input.fill("gmail.com");
  await add.click();
  await expect(page.getByText(/You can't send as gmail\.com/)).toBeVisible();
  await input.fill("not a domain");
  await add.click();
  await expect(page.getByText("Enter a domain like acme.com or mail.acme.com.")).toBeVisible();

  // A pasted address is turned into its domain
  await input.fill("News@Mail.Acme.Test");
  await add.click();
  await expect(page).toHaveURL(/\/settings\/domains\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "mail.acme.test" })).toBeVisible();
  await expect(page.getByText("Waiting for DNS")).toBeVisible();

  await expect(page.getByLabel("SPF record name")).toHaveValue("mail.acme.test");
  await expect(page.getByLabel("SPF record value")).toHaveValue(
    "v=spf1 include:amazonses.com ~all",
  );
  await expect(page.getByLabel("DKIM record name")).toHaveValue(
    /^sc\d{6}\._domainkey\.mail\.acme.test$/,
  );
  await expect(page.getByLabel("DKIM record value")).toHaveValue(/^v=DKIM1; k=rsa; p=MIIB/);
  await expect(page.getByLabel("DMARC record name")).toHaveValue("_dmarc.mail.acme.test");
  await expect(page.getByLabel("DMARC record value")).toHaveValue(/^v=DMARC1; p=none;/);

  // Checking now reports exactly what is missing (.test domains never resolve)
  await page.getByRole("button", { name: "Check now" }).click();
  const report = page.getByRole("status").filter({ hasText: "No SPF record found." });
  await expect(report).toContainText("No DKIM record found.");
  await expect(report).toContainText("No DMARC record found.");
  await expect(page.getByText(/Last checked at/)).toBeVisible();

  // Copy buttons put the value on the clipboard
  await page.getByRole("button", { name: "Copy" }).nth(3).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^v=DKIM1/);

  // The same domain can't be added twice
  await page.getByRole("link", { name: "Sending domains" }).click();
  await expect(page.getByRole("row").filter({ hasText: "mail.acme.test" })).toContainText(
    "Waiting for DNS",
  );
  await input.fill("mail.acme.test");
  await add.click();
  await expect(page.getByText("mail.acme.test is already added.")).toBeVisible();

  // Deleting returns to the list
  await page.getByRole("link", { name: "mail.acme.test" }).click();
  await page.getByRole("button", { name: "Delete domain" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete domain" }).click();
  await expect(page).toHaveURL(/\/settings\/domains$/);
  await expect(page.getByRole("row").filter({ hasText: "mail.acme.test" })).toHaveCount(0);
});
