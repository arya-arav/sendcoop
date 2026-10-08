import { expect, test } from "@playwright/test";
import { createList, createSegment, createSubscriber, getSql } from "@sendcoop/db";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("campaign recipients are chosen from lists and segments, with a live count", async ({
  page,
}) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Campaigner",
    email: uniqueEmail("recipients"),
    workspace: `Recipients ${Date.now()}`,
  });

  // Buyers: ana, bo, cy. Leads: cy, dee. eve on no list, named Vip.
  const [ws] = await getSql()<{ id: string }[]>`select id from workspaces where slug = ${slug}`;
  const buyers = await createList(ws!.id, { name: "Buyers", description: null });
  const leads = await createList(ws!.id, { name: "Leads", description: null });
  if (!buyers.ok || !leads.ok) throw new Error("setup");
  const people: [string, string[], string | null][] = [
    ["ana", [buyers.list.id], null],
    ["bo", [buyers.list.id], null],
    ["cy", [buyers.list.id, leads.list.id], null],
    ["dee", [leads.list.id], null],
    ["eve", [], "Vip"],
  ];
  for (const [name, lists, firstName] of people) {
    await createSubscriber(ws!.id, { email: uniqueEmail(name), firstName, lastName: null }, lists);
  }
  await createSegment(ws!.id, {
    name: "VIPs",
    rules: {
      match: "all",
      conditions: [{ type: "field", field: "first_name", op: "equals", value: "Vip" }],
    },
  });

  await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: "Campaigns" }).click();
  await expect(page.getByText("No campaigns yet")).toBeVisible();
  await page.getByRole("button", { name: "Create your first campaign" }).click();
  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+\/recipients$/);
  const count = page.getByRole("status");
  await expect(count).toHaveText("0 recipients");

  await page.getByLabel("Everyone subscribed").check();
  await expect(count).toHaveText("5 recipients");

  const sendTo = page.getByRole("radiogroup", { name: "Send to" });
  await sendTo.getByLabel("People in specific lists or segments").check();
  const include = page.locator("fieldset").filter({ hasText: "Lists" }).first();
  await include.getByLabel(/^Buyers/).check();
  await expect(count).toHaveText("3 recipients");
  await include.getByLabel(/^Leads/).check();
  await expect(count).toHaveText("4 recipients"); // cy counted once
  await page.getByLabel("VIPs").first().check();
  await expect(count).toHaveText("5 recipients");

  // Leave out the leads list
  await page.locator("#exclude-list-" + leads.list.id).check();
  await expect(count).toHaveText("3 recipients"); // ana, bo, eve

  await page.getByLabel("Campaign name").fill("October promo");
  await page.getByRole("button", { name: "Save recipients" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Everything is kept
  await page.reload();
  await expect(page.getByRole("heading", { name: "October promo" })).toBeVisible();
  await expect(count).toHaveText("3 recipients");
  await expect(page.locator("#exclude-list-" + leads.list.id)).toBeChecked();
  await expect(page.getByRole("navigation", { name: "Campaign steps" })).toContainText(
    "Recipients",
  );

  await page.getByRole("link", { name: "Campaigns", exact: true }).first().click();
  await expect(page.getByRole("row").filter({ hasText: "October promo" })).toContainText("Draft");
});
