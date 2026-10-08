import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("the curl example from settings records a conversion", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Backend Dev",
    email: uniqueEmail("api"),
    workspace: `Api ${Date.now()}`,
  });
  await page.goto(`/w/${slug}/settings/tracking`);
  const api = page.locator("[data-slot=card]", { hasText: "Conversion API" });
  const example = await api.getByLabel("curl example").inputValue();
  expect(example).toContain(`SENDCOOP_SECRET="${await api.getByLabel("API secret").inputValue()}"`);
  expect(example).toContain("http://localhost:3001/v1/conversions");

  // Run as written, in a shell, with curl and openssl
  const run = () => JSON.parse(execFileSync("bash", ["-c", example], { encoding: "utf8" }));
  expect(run()).toMatchObject({ result: "created", attributed_by: "none" });
  expect(run()).toMatchObject({ result: "duplicate" });

  await page.reload();
  const row = page
    .locator("[data-slot=card]", { hasText: "Recent conversions" })
    .getByRole("row")
    .filter({ hasText: "API" });
  await expect(row).toContainText("$49.99");

  // A new secret: the example with the old one is refused
  await api.getByRole("button", { name: "New secret" }).click();
  await page.getByRole("button", { name: "Make a new secret" }).click();
  await expect(api.getByLabel("curl example")).not.toHaveValue(example);
  expect(run()).toEqual({ error: expect.stringMatching(/signature doesn't match/) });
});
