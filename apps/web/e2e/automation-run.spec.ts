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

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

test("a live automation emails someone who joins its list", async ({ page }) => {
  test.setTimeout(90_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Welcomer",
    email: uniqueEmail("automation-run"),
    workspace: `Welcome flow ${Date.now()}`,
  });
  const [ws] = await getSql()<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  const workspaceId = ws!.id;
  // Somewhere to send from (domain and server), and the list it listens to
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
  const list = await createList(workspaceId, { name: "New members", description: null });
  if (!domain.ok || !list.ok) throw new Error("setup");

  // Build it: joins "New members" → a welcome email → the end
  await page.goto(`/w/${slug}/automations`);
  await page.getByRole("button", { name: "New automation" }).click();
  await expect(page).toHaveURL(/\/automations\/[0-9a-f-]{36}$/);
  const automationUrl = page.url();
  const panel = page.getByRole("region", { name: "Selected step" });
  await page.getByLabel("Automation name").fill("Welcome");
  await panel.getByLabel("List").selectOption({ label: "New members" });
  await page
    .getByRole("navigation", { name: "Steps" })
    .getByRole("button", { name: /^Email 1:/ })
    .click();
  await panel.getByLabel("Subject line").fill("Welcome to the club");

  // Write the email: saves, opens the editor; back to the automation after
  await panel.getByRole("button", { name: "Write the email" }).click();
  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}\/design$/);
  await page.getByRole("textbox", { name: "HTML code" }).click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(
    '<html><body><p>Hi {{first_name | there}}, welcome! <a href="https://club.example/start">Start here</a></p></body></html>',
  );
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").first()).toHaveText("All changes saved");
  await page.getByRole("link", { name: "Back to the automation" }).click();
  await expect(page).toHaveURL(automationUrl);

  // Ready: go live
  await expect(page.getByRole("note")).toHaveText("Ready to go live.");
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByText("This automation is live.")).toBeVisible();

  // Someone joins the list: the welcome arrives, with its link tracked
  const member = uniqueEmail("new-member");
  await createSubscriber(workspaceId, { email: member, firstName: "Robin", lastName: null }, [
    list.list.id,
  ]);
  const { links } = await waitForTrackedUrls(member);
  expect(links).toHaveLength(1);
  const found = (await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${member}"`)}`,
  ).then((r) => r.json())) as { messages: { Subject: string; ID: string }[] };
  expect(found.messages.map((m) => m.Subject)).toEqual(["Welcome to the club"]);
  const { Text } = (await fetch(`${MAILPIT}/api/v1/message/${found.messages[0]!.ID}`).then((r) =>
    r.json(),
  )) as { Text: string };
  expect(Text).toContain("Hi Robin, welcome!");

  // The run went to the end
  await expect
    .poll(async () => {
      const rows = await getSql()<{ status: string }[]>`
        select r.status from automation_runs r join subscribers s on s.id = r.subscriber_id
        where s.email = ${member}`;
      return rows.map((r) => r.status);
    })
    .toEqual(["completed"]);
  await page.goto(`/w/${slug}/automations`);
  await expect(
    page.getByRole("table", { name: "Automations" }).getByRole("row", { name: /Welcome/ }),
  ).toContainText("Live");
});
