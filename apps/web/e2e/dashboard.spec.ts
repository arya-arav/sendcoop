import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("the dashboard loads in under a second with 50,000 sends, and its numbers add up", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Dash Owner",
    email: uniqueEmail("dashboard"),
    workspace: `Dashboard ${Date.now()}`,
  });
  // 20 campaigns over 60 days, ~2,500 clicks and ~250 sales
  execFileSync("pnpm", ["--filter", "@sendcoop/db", "seed:revenue", slug, "50000"], {
    cwd: "../..",
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  // Warm once (a dev server compiles on first visit), then time a real load
  await page.goto(`/w/${slug}`);
  await expect(page.getByRole("heading", { name: "Revenue per day" })).toBeVisible();
  const started = Date.now();
  await page.goto(`/w/${slug}`);
  await expect(page.getByRole("list", { name: "Top campaigns" })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(1_000);

  // The revenue tile is the conversions table's last 30 days
  const [truth] = await getSql()<{ total: number }[]>`
    select coalesce(sum(v.value_base), 0)::float8 as total
    from conversions v join workspaces w on w.id = v.workspace_id
    where w.slug = ${slug} and v.status = 'approved'
      and v.created_at >= (current_date - 29)::timestamptz`;
  const money = truth!.total.toLocaleString("en", { style: "currency", currency: "USD" });
  await expect(page.getByRole("region", { name: "Last 30 days" })).toContainText(money);

  // One column per day, each with its numbers for keyboard and screen readers
  const days = page.getByRole("list", { name: "Revenue per day" }).getByRole("listitem");
  await expect(days).toHaveCount(30);
  await days.last().focus();
  await expect(page.getByRole("status")).toContainText("conversions");
  await expect(page.getByRole("list", { name: "Top campaigns" }).getByRole("listitem")).toHaveCount(
    5,
  );
  const offers = page.getByRole("list", { name: "Top offers" }).getByRole("listitem");
  await expect(offers).toHaveCount(5);
  await expect(offers.first()).toContainText(/\d+ sales · \d+ clicks/);
});
