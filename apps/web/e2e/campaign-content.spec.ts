import { expect, test } from "@playwright/test";
import { addSendingDomain, createSendingServer, getSql } from "@sendcoop/db";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

test("a campaign gets its subject, sender and email, and a test arrives", async ({ page }) => {
  test.setTimeout(90_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Content Writer",
    email: uniqueEmail("content"),
    workspace: `Content ${Date.now()}`,
  });
  const [ws] = await getSql()<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  const domain = await addSendingDomain(ws!.id, `mail.${slug}.test`);
  if (!domain.ok) throw new Error("setup");
  await createSendingServer(ws!.id, {
    name: "Mailpit",
    type: "smtp",
    summary: "mailpit",
    config: {
      type: "smtp",
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1026),
      secure: false,
    },
  });

  await page.goto(`/w/${slug}/campaigns`);
  await page.getByRole("button", { name: "Create your first campaign" }).click();
  await page
    .getByRole("navigation", { name: "Campaign steps" })
    .getByRole("link", { name: /Content/ })
    .click();
  await expect(page).toHaveURL(/\/content$/);

  // A test needs content, a domain and a server first
  await page.getByRole("button", { name: "Send test" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "content first" })).toHaveText(
    "Add the email's content first.",
  );

  // Subject and sender
  await page.getByLabel("Subject").fill("{{first_name | Friend}}, 40% off ends tonight");
  await page.getByLabel("Preview text").fill("Our biggest sale of the year");
  await page.getByLabel("From name").fill("Acme Deals");
  await page.getByLabel("From address").fill("deals");
  await page
    .getByLabel("Sending domain")
    .selectOption({ label: `mail.${slug}.test (not verified)` });
  await page.getByLabel("Sending server").selectOption({ label: "Mailpit (mailpit)" });
  await page.getByRole("button", { name: "Save subject and sender" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // The email, from a gallery starter
  await page.getByLabel("Template").selectOption({ label: "Flash sale (Ecommerce)" });
  await page.getByRole("button", { name: "Use template" }).click();
  await expect(
    page.frameLocator('iframe[title="Email preview"]').getByText("40% OFF"),
  ).toBeVisible();

  // It opens in the editor, and back
  await page.getByRole("link", { name: "Edit email" }).click();
  await expect(page.getByRole("status")).toHaveText("All changes saved", { timeout: 20_000 });
  await expect(page.frameLocator(".gjs-frame").getByText("40% OFF")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page.getByRole("link", { name: "Back to the campaign" }).click();
  await expect(page).toHaveURL(/\/content$/);

  // Send a test
  const inbox = uniqueEmail("test-inbox");
  await page.getByLabel("Send to").fill(inbox);
  await page.getByRole("button", { name: "Send test" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Test sent" })).toHaveText(
    `Test sent to ${inbox}.`,
  );

  let message:
    { Subject: string; HTML: string; From: { Name: string; Address: string } } | undefined;
  await expect
    .poll(
      async () => {
        const found = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${inbox}"`)}`,
        ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
        const id = found.messages?.[0]?.ID;
        if (id) message = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
        return Boolean(id);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  expect(message!.Subject).toBe("[Test] Friend, 40% off ends tonight");
  expect(message!.From).toEqual({ Name: "Acme Deals", Address: `deals@mail.${slug}.test` });
  expect(message!.HTML).toContain("40% OFF");
  expect(message!.HTML).toMatch(/<div style="display:none;[^"]*">Our biggest sale of the year/);

  // Switching to HTML code opens the code editor
  await page.getByRole("button", { name: "HTML code" }).click();
  await expect(page).toHaveURL(/\/design$/);
  await expect(page.getByRole("textbox", { name: "HTML code" })).toContainText(
    "Write your message here.",
  );
});
