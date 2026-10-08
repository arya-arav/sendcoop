import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { type FakeAnthropic, startFakeAnthropic } from "./fake-anthropic";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

// AI assist (D70) against a fake Claude API on the port the servers were
// started with (ANTHROPIC_BASE_URL in playwright.config.ts). One file, in
// order, so only one fake holds the port.

test.describe.configure({ mode: "serial" });

let fake: FakeAnthropic;
test.beforeAll(async () => {
  fake = await startFakeAnthropic(3010);
});
test.afterAll(async () => {
  await fake?.close();
});

test("a draft written with AI goes into the email, and its subject can be used", async ({
  page,
}) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Copy Writer",
    email: uniqueEmail("ai-email"),
    workspace: `AI email ${Date.now()}`,
  });
  await page.goto(`/w/${slug}/templates/new`);
  await page.getByRole("button", { name: "Write HTML" }).click();
  await expect(page.getByRole("status").first()).toHaveText("All changes saved", {
    timeout: 20_000,
  });
  const code = page.getByRole("textbox", { name: "HTML code" });
  await code.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("<html><body>\n</body></html>");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("End");

  await page.getByRole("button", { name: "Write with AI" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("What should the email say?")
    .fill("Spring sale: 20% off all boots until Sunday, link to https://shop.example/boots");
  await dialog.getByRole("button", { name: "Write it" }).click();
  const draft = dialog.getByRole("region", { name: "AI draft" });
  await expect(draft).toContainText("Spring boots, 20% off until Sunday");
  await draft.getByRole("button", { name: "Use the subject" }).click();
  await draft.getByRole("button", { name: "Insert into the email" }).click();
  await expect(dialog).toBeHidden();

  // In the editor, where the cursor was
  await expect(code).toContainText("Our spring sale is on: 20% off every pair of boots");
  await expect(code).toContainText('<a href="https://shop.example/boots">See the boots</a>');
  await expect(page.getByLabel("Subject line", { exact: true })).toHaveValue(
    "Spring boots, 20% off until Sunday",
  );

  // Subject lines for the email as written
  await page.getByRole("button", { name: "Suggest subject lines" }).click();
  const suggestions = page.getByRole("list", { name: "Suggested subject lines" });
  await expect(suggestions.getByRole("button")).toHaveCount(5);
  await suggestions.getByRole("button", { name: "Ready for spring?" }).click();
  await expect(page.getByLabel("Subject line", { exact: true })).toHaveValue("Ready for spring?");

  // Asked of Claude Opus 5.5, as JSON, with the refusal fallback on
  const request = fake.requests.find((r) => JSON.stringify(r).includes("Write one email"))!;
  expect(request).toMatchObject({
    model: "claude-opus-5-5",
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema" } },
  });
  expect(String((request.headers as Record<string, string>)["anthropic-beta"])).toContain(
    "server-side-fallback-2026-07-01",
  );
});

test("an automation is drafted from a goal, its emails written", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Flow Asker",
    email: uniqueEmail("ai-flow"),
    workspace: `AI flow ${Date.now()}`,
  });
  await page.goto(`/w/${slug}/automations`);
  await page.getByLabel("Goal").fill("Turn new webinar sign-ups into buyers of my course");
  await page.getByRole("button", { name: "Draft the flow" }).click();
  await expect(page).toHaveURL(/\/automations\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Automation name")).toHaveValue("Webinar to course");
  await expect(page.getByRole("navigation", { name: "Steps" }).getByRole("listitem")).toHaveText([
    "Trigger: Choose what starts it",
    "Replay: Here's the webinar replay",
    "Wait: 2 days",
    "Course: The course, if you want to go further",
    "Exit: The end",
  ]);
  await expect(page.getByLabel("Stop when they buy")).toBeChecked();
  const automationId = page.url().split("/").pop()!;
  const emails = await getSql()<{ text: string }[]>`
    select text from campaigns where automation_id = ${automationId} order by subject`;
  expect(emails.map((e) => e.text)).toEqual([
    expect.stringContaining("Here's the replay."),
    expect.stringContaining("the course goes deeper"),
  ]);
});
