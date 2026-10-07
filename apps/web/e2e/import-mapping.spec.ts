import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const dir = mkdtempSync(join(tmpdir(), "sendcoop-e2e-csv-"));
function csvFile(name: string, content: string) {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

async function upload(page: Page, slug: string, path: string) {
  await page.goto(`/w/${slug}/contacts/import`);
  await page.getByLabel("CSV file").setInputFiles(path);
}

test("a CSV is uploaded, its columns mapped and previewed", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Import Owner",
    email: uniqueEmail("import"),
    workspace: "Import Co",
  });

  // A dropdown field and a list to map into
  await page.goto(`/w/${slug}/contacts/fields`);
  await page.getByRole("button", { name: "Create your first field" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Label").fill("Plan");
  await dialog.getByLabel("Type").selectOption("dropdown");
  await dialog.getByLabel("Options").fill("Starter\nPro");
  await dialog.getByRole("button", { name: "Create field" }).click();
  await expect(dialog).toBeHidden();
  await page.goto(`/w/${slug}/lists`);
  await page.getByRole("button", { name: "Create your first list" }).click();
  await dialog.getByLabel("Name").fill("Imported leads");
  await dialog.getByRole("button", { name: "Create list" }).click();
  await expect(dialog).toBeHidden();

  // Upload from the Contacts page's Import button
  await page.goto(`/w/${slug}/contacts`);
  await page.getByRole("link", { name: "Import" }).click();
  await page
    .getByLabel("CSV file")
    .setInputFiles(
      csvFile(
        "leads.csv",
        [
          "E-mail Address,First Name,Surname,Plan,Notes",
          "priya@example.com,Priya,Sharma,pro,VIP",
          "not-an-email,Sam,Lee,Starter,",
          "jo@example.com,Jo,,Gold,",
          "ana@example.com,Ana,Garcia,,called twice",
        ].join("\n"),
      ),
    );
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/contacts/import/[0-9a-f-]+$`));
  await expect(page.getByRole("heading", { name: "leads.csv" })).toBeVisible();
  await expect(page.getByText("5 columns separated by commas")).toBeVisible();

  // Columns were matched from their names; "Notes" isn't imported
  await expect(page.getByLabel("Import “E-mail Address” as")).toHaveValue("email");
  await expect(page.getByLabel("Import “First Name” as")).toHaveValue("first_name");
  await expect(page.getByLabel("Import “Surname” as")).toHaveValue("last_name");
  await expect(page.getByLabel("Import “Plan” as")).toHaveValue("field:plan");
  await expect(page.getByLabel("Import “Notes” as")).toHaveValue("");

  // The preview shows what will be imported and what will be skipped
  await expect(page.getByText("2 of 4 sample rows are ready to import")).toBeVisible();
  const preview = page.getByRole("table");
  await expect(preview.getByRole("row").filter({ hasText: "priya@example.com" })).toContainText(
    "Pro",
  );
  await expect(preview).toContainText("Row 2 will be skipped: “not-an-email” isn't a valid email.");
  await expect(preview).toContainText("Row 3 will be skipped: Plan must be one of: Starter, Pro.");

  // Not importing the Plan column makes row 3 valid
  await page.getByLabel("Import “Plan” as").selectOption("");
  await expect(page.getByText("3 of 4 sample rows are ready to import")).toBeVisible();

  // Without an email column nothing can be saved
  await page.getByLabel("Import “E-mail Address” as").selectOption("");
  await expect(
    page.getByText("Choose which column holds the email address.").first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save mapping" })).toBeDisabled();
  await page.getByLabel("Import “E-mail Address” as").selectOption("email");

  // Each target can only be used once
  await expect(page.getByLabel("Import “Notes” as").locator("option[value=email]")).toBeDisabled();

  // Save with a list and "update existing", then reload: everything persists
  await page.getByLabel("Imported leads").check();
  await page.getByLabel("Update existing subscribers").check();
  await page.getByRole("button", { name: "Save mapping" }).click();
  await expect(page.getByText(/Mapping saved\./)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Import “Plan” as")).toHaveValue("");
  await expect(page.getByLabel("Imported leads")).toBeChecked();
  await expect(page.getByLabel("Update existing subscribers")).toBeChecked();

  // The upload is listed on the import page
  await page.getByRole("link", { name: "Import", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "leads.csv" })).toContainText(
    "Needs mapping",
  );
});

test("files without a header row, empty files and other formats", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Import Edge",
    email: uniqueEmail("import-edge"),
    workspace: "Import Edge Co",
  });

  // No header: the column of email addresses is found from the values
  await upload(page, slug, csvFile("no-header.csv", "Ana;ana@example.com\nBo;bo@example.com\n"));
  await expect(page.getByText(/separated by semicolons · no header row/)).toBeVisible();
  await expect(page.getByLabel("Import “Column 2” as")).toHaveValue("email");
  await expect(page.getByText("2 of 2 sample rows are ready to import")).toBeVisible();

  await upload(page, slug, csvFile("empty.csv", "\n\n"));
  await expect(page.getByRole("alert").filter({ hasText: "The file is empty." })).toBeVisible();

  await upload(page, slug, csvFile("photo.png", "not a csv"));
  await expect(page.getByRole("alert").filter({ hasText: "Choose a .csv file." })).toBeVisible();
});
