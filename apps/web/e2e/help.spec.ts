import { expect, test } from "@playwright/test";

// The help center (D83): public, every guide and network page published.
test("every help guide and network page is published, without signing in", async ({ page }) => {
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Help", level: 1 })).toBeVisible();
  const guides = await page
    .getByRole("main")
    .getByRole("link")
    .evaluateAll((links) => links.map((l) => (l as HTMLAnchorElement).getAttribute("href")!));
  const pages = guides.filter((href) => href.startsWith("/help/"));
  expect(pages.length).toBeGreaterThanOrEqual(18); // 8 guides and 10 networks

  for (const href of pages) {
    const response = await page.goto(href);
    expect(response?.status(), href).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
  }
});

test("a network guide shows the postback URL with that network's macros", async ({ page }) => {
  await page.goto("/help/networks/clickbank");
  await expect(page.getByRole("heading", { name: "ClickBank", level: 1 })).toBeVisible();
  await expect(page.getByText(/\/pb\?key=<your postback key>&cid=\{tid\}/)).toBeVisible();
});
