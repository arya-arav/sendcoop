import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { AUTOMATION_TEMPLATES, templateGraph } from "@sendcoop/db/automation-templates";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

// What each flow still needs before it can go live, once installed.
const NEEDS: Record<string, string> = {
  welcome: "Before it can go live: Choose the list that starts the automation.",
  "affiliate-bridge": "Before it can go live: Choose the list that starts the automation.",
  "abandoned-cart": "Ready to go live.",
  "post-purchase": "Ready to go live.",
  "lead-nurture": "Before it can go live: Choose a tag.",
};

test("each ready-made flow installs in one click, with its emails written", async ({ page }) => {
  test.setTimeout(90_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Flow Shopper",
    email: uniqueEmail("templates"),
    workspace: `Templates ${Date.now()}`,
  });

  for (const template of AUTOMATION_TEMPLATES) {
    await page.goto(`/w/${slug}/automations`);
    await page.getByRole("button", { name: `Use ${template.name}` }).click();
    await expect(page).toHaveURL(/\/automations\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Automation name")).toHaveValue(template.name);

    const { graph } = templateGraph(template);
    const steps = page.getByRole("navigation", { name: "Steps" }).getByRole("listitem");
    await expect(steps).toHaveCount(graph.nodes.length);
    await expect(page.getByRole("note")).toHaveText(NEEDS[template.id]!);
    await expect(page.getByLabel("Stop when they buy")).toBeChecked({
      checked: template.exitOnConversion,
    });

    // Every email step has its content, ready to read over
    const automationId = page.url().split("/").pop()!;
    const emails = await getSql()<{ subject: string; html: string }[]>`
      select subject, html from campaigns where automation_id = ${automationId} and kind = 'automation'`;
    expect(emails).toHaveLength(graph.nodes.filter((n) => n.type === "email").length);
    for (const email of emails) {
      expect(email.subject).toBeTruthy();
      expect(email.html).toContain("{{first_name | there}}");
    }
  }

  // All five, as drafts
  await page.goto(`/w/${slug}/automations`);
  await expect(page.getByRole("table", { name: "Automations" }).getByRole("row")).toHaveCount(6);
  await expect(
    page.getByRole("table", { name: "Automations" }).getByRole("row", { name: /Abandoned cart/ }),
  ).toContainText("Draft");
});
