import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("an automation is built from a trigger, email, wait and condition, saved and reloaded", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Flow Builder",
    email: uniqueEmail("automation"),
    workspace: `Automations ${Date.now()}`,
  });
  const [workspace] = await getSql()<
    { id: string }[]
  >`select id from workspaces where slug = ${slug}`;
  await getSql()`insert into lists (workspace_id, name) values (${workspace!.id}, 'Newsletter')`;
  await getSql()`insert into tags (workspace_id, name) values (${workspace!.id}, 'engaged')`;

  await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: "Automations" }).click();
  await expect(page.getByText("No automations yet")).toBeVisible();
  await page.getByRole("button", { name: "New automation" }).click();
  await expect(page).toHaveURL(/\/automations\/[0-9a-f-]{36}$/);

  const steps = page.getByRole("navigation", { name: "Steps" });
  const panel = page.getByRole("region", { name: "Selected step" });
  await page.getByLabel("Automation name").fill("Welcome series");

  // The trigger: joining the newsletter
  await panel.getByLabel("Starts when someone").selectOption("joined_list");
  await panel.getByLabel("List").selectOption({ label: "Newsletter" });

  // The first email's subject
  await steps.getByRole("button", { name: /^Email 1:/ }).click();
  await panel.getByLabel("Subject line").fill("Welcome aboard!");

  // After it: wait two days, then check for a click
  await page.getByRole("button", { name: "Add wait step" }).click();
  await panel.getByLabel("Wait for").fill("2");
  await page.getByRole("button", { name: "Add condition step" }).click();
  await panel.getByLabel("Which email").selectOption({ label: "Email 1" });
  // Clicked: carry on to the end; didn't: tag them, then a second email
  await page.getByRole("button", { name: "Add action step" }).click();
  await panel.getByLabel("Tag").selectOption({ label: "engaged" });
  await page.getByRole("button", { name: "Add email step" }).click();
  await panel.getByLabel("Subject line").fill("Did you see this?");

  await expect(page.getByRole("status")).toHaveText("Unsaved changes");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  // Reloaded: all of it
  await page.reload();
  await expect(page.getByLabel("Automation name")).toHaveValue("Welcome series");
  await expect(steps.getByRole("listitem")).toHaveText([
    "Trigger: Joins Newsletter",
    "Email 1: Welcome aboard!",
    "Exit: The end",
    "Wait: 2 days",
    "Condition: Clicked “Email 1”?",
    "Action: Add tag engaged",
    "Email 2: Did you see this?",
  ]);
  // The flow as connected: email 1 → wait → condition; yes → exit; no → tag → email 2
  const [saved] = await getSql()<
    {
      graph: {
        edges: { source: string; target: string; sourceHandle: string | null }[];
        nodes: { id: string; type: string }[];
      };
    }[]
  >`
    select graph from automations where workspace_id = ${workspace!.id}`;
  const type = (id: string) => saved!.graph.nodes.find((n) => n.id === id)!.type;
  const path = saved!.graph.edges.map(
    (e) => `${type(e.source)}${e.sourceHandle ? `(${e.sourceHandle})` : ""}>${type(e.target)}`,
  );
  expect(path.sort()).toEqual(
    [
      "trigger>email",
      "email>wait",
      "wait>condition",
      "condition(yes)>exit",
      "condition(no)>action",
      "action>email",
    ].sort(),
  );
  // Still a draft: the emails aren't written yet
  await expect(page.getByRole("note")).toHaveText(
    "Before it can go live: Write the content of “Email 1”.",
  );

  await page.getByRole("link", { name: "Back to automations" }).click();
  await expect(
    page.getByRole("table", { name: "Automations" }).getByRole("row", { name: /Welcome series/ }),
  ).toContainText("Draft");
});

test("a condition on a field's value is set, saved and reloaded", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Condition Setter",
    email: uniqueEmail("automation-condition"),
    workspace: `Conditions ${Date.now()}`,
  });
  await page.goto(`/w/${slug}/automations`);
  await page.getByRole("button", { name: "New automation" }).click();
  await expect(page).toHaveURL(/\/automations\/[0-9a-f-]{36}$/);
  const steps = page.getByRole("navigation", { name: "Steps" });
  const panel = page.getByRole("region", { name: "Selected step" });

  await steps.getByRole("button", { name: /^Email 1:/ }).click();
  await page.getByRole("button", { name: "Add condition step" }).click();
  await panel.getByLabel("Check").selectOption("rules");
  await panel.getByLabel("Field").selectOption({ label: "Lifetime value" });
  await panel.getByLabel("Comparison").selectOption("gt");
  await panel.getByLabel("Value").fill("100");
  await expect(steps.getByRole("button", { name: /^Condition:/ })).toHaveText(
    "Condition: Lifetime value > 100?",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  await page.reload();
  await steps.getByRole("button", { name: /^Condition:/ }).click();
  await expect(panel.getByLabel("Check")).toHaveValue("rules");
  await expect(panel.getByLabel("Field")).toHaveValue("lifetime_value");
  await expect(panel.getByLabel("Value")).toHaveValue("100");
});
