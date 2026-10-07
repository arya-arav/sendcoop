import { expect, test } from "@playwright/test";
import { closeConnections, sendCampaign } from "./campaigns";
import { emailCount, emailLink, signUpWithWorkspace, uniqueEmail } from "./helpers";

test.afterAll(closeConnections);

test("suppressed addresses are listed, imported, exported and never mailed", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "List Keeper",
    email: uniqueEmail("supp-owner"),
    workspace: `Suppress ${Date.now()}`,
  });
  const blocked = uniqueEmail("supp-blocked");
  const [fromFile, alsoFromFile] = [uniqueEmail("supp-file1"), uniqueEmail("supp-file2")];

  await page.goto(`/w/${slug}/contacts`);
  await page.getByRole("link", { name: "Suppression list" }).click();
  await expect(page.getByText("No suppressed addresses yet")).toBeVisible();

  // Paste some addresses and upload a CSV in one go
  await page.getByRole("button", { name: "Add addresses" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Addresses").fill(`${blocked.toUpperCase()}\nnot-an-address`);
  await dialog.getByLabel("Or upload a CSV or text file").setInputFiles({
    name: "unsubscribes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`email,name\n${fromFile},A\n${alsoFromFile},B\n${blocked},C\n`),
  });
  await dialog.getByRole("button", { name: "Add to list" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toHaveText(
    "Added 3 addresses. 2 lines had no valid address.",
  );
  await expect(page.getByText("3 addresses", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: blocked })).toContainText("Added");

  // Search
  await page.getByLabel("Search addresses").fill("supp-file");
  await page.getByLabel("Search addresses").press("Enter");
  await expect(page.getByRole("row")).toHaveCount(3); // header + 2

  // Export is a CSV that imports back
  const csv = await (await page.request.get(`/api/w/${slug}/suppressions`)).text();
  expect(csv.split("\r\n")[0]).toBe("email,reason,added_at");
  expect(csv).toContain(`${blocked},manual,`);
  expect(csv.trim().split("\r\n")).toHaveLength(4);

  // Remove one
  await page.getByRole("button", { name: `Remove ${alsoFromFile}` }).click();
  await expect(page.getByRole("row").filter({ hasText: alsoFromFile })).toHaveCount(0);

  // A campaign to the list skips the suppressed address
  const welcome = uniqueEmail("supp-ok");
  await sendCampaign(slug, [blocked, welcome]);
  await emailLink(welcome, /\/u\/\S+/);
  expect(await emailCount(blocked)).toBe(0);
});
