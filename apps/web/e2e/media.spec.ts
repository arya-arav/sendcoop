import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import sharp from "sharp";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

test("an image is uploaded in the editor, stored publicly and shown in the email", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await signUpWithWorkspace(page, {
    name: "Image Uploader",
    email: uniqueEmail("media"),
    workspace: `Media ${Date.now()}`,
  });
  await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: "Templates" }).click();
  await page.getByRole("link", { name: "Create your first template" }).click();
  await page.getByRole("button", { name: "Start from scratch" }).click();
  await expect(page.getByRole("status")).toHaveText("All changes saved", { timeout: 20_000 });
  const templateId = page.url().split("/").pop()!;

  // A photo straight off a camera: big, with location metadata
  const photo = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: { r: 20, g: 120, b: 220 } },
  })
    .withExif({ IFD0: { Copyright: "camera-owner" } })
    .jpeg()
    .toBuffer();

  // Double-click the logo to open the image picker, and upload
  const canvas = page.frameLocator(".gjs-frame");
  await canvas.getByRole("img", { name: "Your logo" }).dblclick();
  const picker = page.locator(".gjs-mdl-dialog");
  await expect(picker).toBeVisible();
  await picker.locator("input[type=file]").setInputFiles({
    name: "beach.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  const uploaded = picker.locator(".gjs-am-asset-image").first();
  await expect(uploaded).toContainText("beach.jpg");
  await uploaded.click();
  await page.locator(".gjs-mdl-btn-close").click();
  const src = await canvas.locator("img").first().getAttribute("src");
  expect(src).toMatch(/\/media\/[0-9a-f-]+\/[0-9a-f]{32}\.jpg$/);

  // A file that isn't an image is refused with a reason
  await canvas.locator("img").first().dblclick();
  await picker.locator("input[type=file]").setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40"/></svg>',
    ),
  });
  await expect(page.getByRole("alert").filter({ hasText: "SVG images" })).toHaveText(
    "SVG images don't show in Gmail or Outlook. Use a PNG instead.",
  );
  await page.locator(".gjs-mdl-btn-close").click();

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("All changes saved");

  // The stored image is public, resized for email and without the metadata
  const response = await page.request.get(src!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/jpeg");
  const stored = await sharp(await response.body()).metadata();
  expect(stored.width).toBe(1200);
  expect(stored.exif).toBeUndefined();

  // ...and it is in the email, displayed in the preview
  const [saved] = await getSql()<{ html: string }[]>`
    select html from templates where id = ${templateId}`;
  expect(saved!.html).toContain(src!);
  await page.getByRole("link", { name: "Preview" }).click();
  const shown = page.frameLocator('iframe[title="Desktop preview"]').locator(`img[src="${src}"]`);
  await expect(shown).toBeVisible();
  await expect
    .poll(() => shown.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(1200);
});
