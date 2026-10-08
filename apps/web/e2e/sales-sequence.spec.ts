import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  addSendingDomain,
  createList,
  createSendingServer,
  createSubscriber,
  getSql,
} from "@sendcoop/db";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";
import { waitForTrackedUrls } from "./tracked";

test("a purchase stops the sales sequence", async ({ page, request }) => {
  test.setTimeout(120_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Sequence Seller",
    email: uniqueEmail("sales-sequence"),
    workspace: `Sales sequence ${Date.now()}`,
  });
  const [ws] = await getSql()<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  const workspaceId = ws!.id;
  const domain = await addSendingDomain(workspaceId, `mail.${slug}.test`);
  await createSendingServer(workspaceId, {
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
  const list = await createList(workspaceId, { name: "Leads", description: null });
  if (!domain.ok || !list.ok) throw new Error("setup");

  // Joins "Leads" → pitch → wait a day → follow-up; stop when they buy
  await page.goto(`/w/${slug}/automations`);
  await page.getByRole("button", { name: "New automation" }).click();
  await expect(page).toHaveURL(/\/automations\/[0-9a-f-]{36}$/);
  const automationUrl = page.url();
  const panel = page.getByRole("region", { name: "Selected step" });
  const steps = page.getByRole("navigation", { name: "Steps" });
  await page.getByLabel("Automation name").fill("Course launch");
  await panel.getByLabel("List").selectOption({ label: "Leads" });
  await page.getByLabel("Stop when they buy").check();
  for (const [step, subject] of [
    ["Email 1", "The course is open"],
    ["Email 2", "Last chance"],
  ] as const) {
    if (step === "Email 2") {
      await steps.getByRole("button", { name: /^Email 1:/ }).click();
      await page.getByRole("button", { name: "Add wait step" }).click();
      await page.getByRole("button", { name: "Add email step" }).click();
    } else {
      await steps.getByRole("button", { name: /^Email 1:/ }).click();
    }
    await panel.getByLabel("Subject line").fill(subject);
    await panel.getByRole("button", { name: "Write the email" }).click();
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}\/design$/);
    await page.getByRole("textbox", { name: "HTML code" }).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(
      `<html><body><p>${subject}. <a href="https://course.example/buy">Enroll</a></p></body></html>`,
    );
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").first()).toHaveText("All changes saved");
    await page.getByRole("link", { name: "Back to the automation" }).click();
    await expect(page).toHaveURL(automationUrl);
  }
  await expect(steps.getByRole("listitem")).toHaveText([
    "Trigger: Joins Leads",
    "Email 1: The course is open",
    "Exit: The end",
    "Wait: 1 day",
    "Email 2: Last chance",
  ]);
  await expect(page.getByLabel("Stop when they buy")).toBeChecked();
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  // A lead joins: the first email, then the wait
  const lead = uniqueEmail("sequence-lead");
  await createSubscriber(workspaceId, { email: lead, firstName: null, lastName: null }, [
    list.list.id,
  ]);
  await waitForTrackedUrls(lead);
  const runStatus = async () => {
    const [row] = await getSql()<{ status: string; exit_reason: string | null }[]>`
      select r.status, r.exit_reason from automation_runs r
      join subscribers s on s.id = r.subscriber_id where s.email = ${lead}`;
    return row ?? null;
  };
  await expect.poll(runStatus).toEqual({ status: "waiting", exit_reason: null });

  // They buy (reported by the store's server): the sequence stops
  await page.goto(`/w/${slug}/settings/tracking`);
  const api = page.locator("[data-slot=card]", { hasText: "Conversion API" });
  const secret = await api.getByLabel("API secret").inputValue();
  const body = JSON.stringify({ email: lead, value: 199, order_id: "COURSE-1" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sale = await request.post("http://localhost:3001/v1/conversions", {
    headers: {
      "content-type": "application/json",
      "sendcoop-workspace": workspaceId,
      "sendcoop-timestamp": timestamp,
      "sendcoop-signature": `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`,
    },
    data: body,
  });
  expect(sale.status()).toBe(201);
  await expect.poll(runStatus, { timeout: 20_000 }).toEqual({
    status: "exited",
    exit_reason: "converted",
  });
});
