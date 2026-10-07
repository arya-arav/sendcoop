import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("an import runs in the worker and reports what it skipped", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Run Owner",
    email: uniqueEmail("import-run"),
    workspace: "Import Run Co",
  });

  // A list to import into
  await page.goto(`/w/${slug}/lists`);
  await page.getByRole("button", { name: "Create your first list" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Webinar");
  await page.getByRole("dialog").getByRole("button", { name: "Create list" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const file = join(mkdtempSync(join(tmpdir(), "sendcoop-e2e-run-")), "webinar.csv");
  writeFileSync(
    file,
    [
      "email,first_name",
      "ana@example.com,Ana",
      "bo@example.com,Bo",
      "nope,Nope", // row 4: invalid
      "ANA@example.com,Ana again", // row 5: duplicate of row 2
      "cy@example.com,Cy",
    ].join("\n"),
  );
  await page.goto(`/w/${slug}/contacts/import`);
  await page.getByLabel("CSV file").setInputFiles(file);
  await expect(page).toHaveURL(/\/contacts\/import\/[0-9a-f-]+$/);

  // Consent is required before starting
  await page.getByLabel("Webinar").check();
  const start = page.getByRole("button", { name: "Start import" });
  await expect(start).toBeDisabled();
  await page.getByLabel(/Everyone in this file agreed/).check();
  await start.click();

  // The worker runs it; the page switches to the summary when it's done
  await expect(page.getByText("Import complete")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("5 rows read")).toBeVisible();
  const stat = (label: string) => page.locator("[data-slot=card]").filter({ hasText: label });
  await expect(stat("Added")).toContainText("3");
  await expect(stat("Skipped")).toContainText("2");

  // The skipped-rows report names each row and why
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download skipped rows" }).click();
  const report = await (await download).path();
  expect(readFileSync(report, "utf8").trim().split("\r\n")).toEqual([
    "row,email,reason",
    "4,nope,“nope” isn't a valid email.",
    "5,ana@example.com,Same email as row 2.",
  ]);

  // The subscribers are there, on the list
  await page.getByRole("link", { name: "View contacts" }).click();
  await expect(page.getByText("3 subscribers")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "ana@example.com" })).toContainText(
    "Webinar",
  );

  // The upload is listed as completed with its result
  await page.goto(`/w/${slug}/contacts/import`);
  await expect(page.getByRole("row").filter({ hasText: "webinar.csv" })).toContainText(
    "3 added, 2 skipped",
  );
});
