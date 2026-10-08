import { expect, type Page, test } from "@playwright/test";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

test.afterAll(closeConnections);

/** Replaces everything in a CodeMirror editor. */
async function replaceCode(page: Page, label: string, code: string) {
  await page.getByRole("textbox", { name: label }).click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(code);
}

async function newestEmailTo(to: string) {
  let message: { Subject: string; HTML: string; Text: string } | undefined;
  await expect
    .poll(
      async () => {
        const found = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
        const id = found.messages?.[0]?.ID;
        if (id) message = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
        return Boolean(id);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return message!;
}

test("HTML-code and plain-text templates are edited, saved and sent", async ({ page }) => {
  test.setTimeout(90_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Coder",
    email: uniqueEmail("code"),
    workspace: `Code ${Date.now()}`,
  });
  const status = page.getByRole("status");

  // HTML: write code, watch the live preview, save
  await page.goto(`/w/${slug}/templates/new`);
  await page.getByRole("button", { name: "Write HTML" }).click();
  await expect(status).toHaveText("All changes saved", { timeout: 20_000 });
  await replaceCode(
    page,
    "HTML code",
    '<html><body><h1>Hi {{first_name | there}}</h1><p>Our <a href="https://shop.test/sale">spring sale</a> is on.</p></body></html>',
  );
  await expect(
    page
      .frameLocator('iframe[title="Live preview"]')
      .getByRole("heading", { name: "Hi {{first_name | there}}" }),
  ).toBeVisible();
  await page.getByLabel("Template name").fill("Spring sale (HTML)");
  await page.getByLabel("Subject line").fill("{{first_name | Friend}}, the spring sale is on");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(status).toHaveText("All changes saved");
  const htmlTemplate = page.url().split("/").pop()!;
  await page.reload();
  await expect(page.getByRole("textbox", { name: "HTML code" })).toContainText("spring sale");

  // Plain text: no HTML at all
  await page.goto(`/w/${slug}/templates/new`);
  await page.getByRole("button", { name: "Write plain text" }).click();
  await expect(status).toHaveText("All changes saved", { timeout: 20_000 });
  await replaceCode(
    page,
    "Email text",
    "Hi {{first_name | there}},\n\nQuick question about your order.\n\nSam",
  );
  await expect(page.getByLabel("Text preview")).toContainText("Quick question about your order.");
  await page.getByLabel("Template name").fill("Personal note");
  await page.getByLabel("Subject line").fill("Quick question");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(status).toHaveText("All changes saved");
  const textTemplate = page.url().split("/").pop()!;
  await page.getByRole("link", { name: "Preview" }).click();
  await expect(page.getByText("The email (sent as plain text)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outlook" })).toHaveCount(0);

  // The list shows each with its editor
  await page.goto(`/w/${slug}/templates`);
  await expect(page.getByRole("row").filter({ hasText: "Spring sale (HTML)" })).toContainText(
    "HTML",
  );
  await expect(page.getByRole("row").filter({ hasText: "Personal note" })).toContainText(
    "Plain text",
  );

  // Both send correctly
  const ana = uniqueEmail("code-ana");
  await sendCampaign(slug, [{ email: ana, firstName: "Ana" }], { templateId: htmlTemplate });
  const html = await newestEmailTo(ana);
  expect(html.Subject).toBe("Ana, the spring sale is on");
  expect(html.HTML).toContain("<h1>Hi Ana</h1>");
  expect(html.HTML).toMatch(/<a href="http[^"]+\/u\/[^"]+"[^>]*>Unsubscribe<\/a>/); // footer added
  // Links go through the click tracker, in the text version too.
  expect(html.Text).toMatch(/Our spring sale \(http:\/\/localhost:3001\/c\/[^)]+\) is on\./);

  const bo = uniqueEmail("code-bo");
  await sendCampaign(slug, [{ email: bo, firstName: "Bo" }], { templateId: textTemplate });
  const text = await newestEmailTo(bo);
  expect(text.Subject).toBe("Quick question");
  expect(text.HTML).toBe("");
  expect(text.Text).toMatch(/^Hi Bo,\r?\n\r?\nQuick question about your order\.\r?\n\r?\nSam/);
  expect(text.Text).toMatch(/Unsubscribe: http\S+\/u\/\S+/);
});
