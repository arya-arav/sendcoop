import { expect, test } from "@playwright/test";
import {
  addSendingDomain,
  createList,
  createSendingServer,
  createSubscriber,
  getSql,
} from "@sendcoop/db";
import { emailCount, signUpWithWorkspace, uniqueEmail } from "./helpers";

test("a campaign is built, scheduled, unscheduled and sent", async ({ page }) => {
  test.setTimeout(90_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Scheduler",
    email: uniqueEmail("schedule"),
    workspace: `Schedule ${Date.now()}`,
  });
  const [ws] = await getSql()<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  const domain = await addSendingDomain(ws!.id, `mail.${slug}.test`);
  const list = await createList(ws!.id, { name: "Readers", description: null });
  if (!domain.ok || !list.ok) throw new Error("setup");
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
  const readers = [uniqueEmail("sched-a"), uniqueEmail("sched-b")];
  for (const email of readers) {
    await createSubscriber(ws!.id, { email, firstName: null, lastName: null }, [list.list.id]);
  }

  await page.goto(`/w/${slug}/campaigns`);
  await page.getByRole("button", { name: "Create your first campaign" }).click();
  const steps = page.getByRole("navigation", { name: "Campaign steps" });

  // Nothing is ready yet
  await steps.getByRole("link", { name: /Schedule/ }).click();
  await expect(page.getByLabel("To do")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /^Send to/ })).toBeDisabled();

  // Recipients
  await steps.getByRole("link", { name: /Recipients/ }).click();
  await page.getByLabel("Everyone subscribed").check();
  await expect(page.getByRole("status")).toHaveText("2 recipients");
  await page.getByLabel("Campaign name").fill("Weekly letter");
  await page.getByRole("button", { name: "Save recipients" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Content
  await steps.getByRole("link", { name: /Content/ }).click();
  await page.getByLabel("Subject").fill("This week at Acme");
  await page
    .getByLabel("Sending domain")
    .selectOption({ label: `mail.${slug}.test (not verified)` });
  await page.getByLabel("Sending server").selectOption({ label: "Mailpit (mailpit)" });
  await page.getByRole("button", { name: "Save subject and sender" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByLabel("Template").selectOption({ label: "Weekly newsletter (Newsletter)" });
  await page.getByRole("button", { name: "Use template" }).click();
  await expect(
    page.frameLocator('iframe[title="Email preview"]').getByText("This week's best"),
  ).toBeVisible();

  // Schedule for later, in Berlin time
  await steps.getByRole("link", { name: /Schedule/ }).click();
  await expect(page.getByLabel("To do")).toHaveCount(0);
  await page.getByLabel("Schedule", { exact: true }).check();
  const later = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Date and time").fill(`${later}T09:30`);
  await page.getByLabel("Timezone", { exact: true }).selectOption("Europe/Berlin");
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.getByText(/Scheduled for .+ 09:30 \(Europe\/Berlin\)\./)).toBeVisible();
  const [row] = await getSql()<{ status: string; at: string }[]>`
    select status, to_char(scheduled_at at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI') as at
    from campaigns where workspace_id = ${ws!.id}`;
  expect(row).toEqual({ status: "scheduled", at: `${later}T09:30` });

  // Changed my mind: back to a draft, and send it now
  await page.getByRole("button", { name: "Cancel schedule" }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await page.getByRole("button", { name: "Send to 2 recipients" }).click();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText("Sent to 2 of 2 recipients.").isVisible();
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  for (const email of readers) expect(await emailCount(email)).toBe(1);
  await page.goto(`/w/${slug}/campaigns`);
  await expect(page.getByRole("row").filter({ hasText: "Weekly letter" })).toContainText("Sent");
});
