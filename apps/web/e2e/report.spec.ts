import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

test.afterAll(closeConnections);

/** The tracked links and open pixel in the email `to` received. */
async function trackedUrls(to: string) {
  const found = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
  ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
  const { HTML } = await fetch(`${MAILPIT}/api/v1/message/${found.messages[0]!.ID}`).then(
    (r) => r.json() as Promise<{ HTML: string }>,
  );
  return {
    links: [...HTML.matchAll(/href="(http:\/\/localhost:3001\/c\/[^"]+)"/g)].map((m) => m[1]!),
    pixel: HTML.match(/src="(http:\/\/localhost:3001\/o\/[^"]+)"/)![1]!,
  };
}

test("the campaign report counts people and leaves machines out", async ({ page, request }) => {
  test.setTimeout(90_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Reporter",
    email: uniqueEmail("report"),
    workspace: `Report ${Date.now()}`,
  });
  const [reader, scanned] = [uniqueEmail("report-reader"), uniqueEmail("report-scanned")];
  const { campaignId } = await sendCampaign(slug, [reader, scanned], {
    html: `<html><body>
      <p><a href="https://shop.example.com/sale">Shop the sale</a></p>
      <p><a href="https://blog.example.com/post">Read the post</a></p>
    </body></html>`,
  });
  await expect
    .poll(
      async () =>
        (
          await getSql()<
            { status: string }[]
          >`select status from campaigns where id = ${campaignId}`
        )[0]?.status,
      { timeout: 20_000 },
    )
    .toBe("sent");
  // Clicks in the first seconds after sending are a scanner's; wait like a person would.
  await page.waitForTimeout(5500);

  const person = { "user-agent": CHROME };
  const mine = await trackedUrls(reader);
  await request.get(mine.links[0]!, { headers: person, maxRedirects: 0 });
  await request.get(mine.links[0]!, { headers: person, maxRedirects: 0 });
  await request.get(mine.links[1]!, { headers: person, maxRedirects: 0 });
  await request.get(mine.pixel, { headers: person });

  // The other email is only touched by machines
  const theirs = await trackedUrls(scanned);
  await request.get(theirs.links[0]!, {
    headers: { "user-agent": "Mimecast-URL-Protect/1.0" },
    maxRedirects: 0,
  });
  await request.get(theirs.pixel, {
    headers: { "user-agent": "Mozilla/5.0", "x-forwarded-for": "17.58.101.5" },
  });

  await page.goto(`/w/${slug}/campaigns/${campaignId}`);
  const results = page.getByRole("region", { name: "Results" });
  const card = (label: string) =>
    results.locator("[data-slot=card]").filter({ has: page.getByText(label, { exact: true }) });
  await expect(card("Delivered")).toContainText("2of 2 sent · 0 bounced");
  await expect(card("Opened")).toContainText("50%1 person · 1 machine open not counted");
  await expect(card("Clicked")).toContainText("50%1 person, 3 clicks · 1 bot click not counted");
  await expect(card("Click-to-open")).toContainText("100%");

  const row = (label: string) => page.getByRole("row").filter({ hasText: label });
  // clicks, people, bots
  await expect(row("Shop the sale")).toContainText(/2\s*1\s*1$/);
  await expect(row("Read the post")).toContainText(/1\s*1\s*0$/);
});
