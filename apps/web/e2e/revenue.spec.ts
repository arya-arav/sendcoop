import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8027";

test.afterAll(closeConnections);

test("the revenue report shows a campaign's sale, EPC and ROI, matching the conversions", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Report Reader",
    email: uniqueEmail("revenue"),
    workspace: `Revenue ${Date.now()}`,
  });
  const reader = uniqueEmail("revenue-reader");
  const { campaignId } = await sendCampaign(slug, [reader], {
    name: "Autumn offer",
    html: `<html><body><a href="https://vendor.hop.clickbank.net/?affiliate=me">Get it</a></body></html>`,
  });

  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const found = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${reader}"`)}`,
        ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
        const id = found.messages?.[0]?.ID;
        if (!id) return false;
        const { HTML } = await fetch(`${MAILPIT}/api/v1/message/${id}`).then(
          (r) => r.json() as Promise<{ HTML: string }>,
        );
        link = HTML.match(/href="(http:\/\/localhost:3001\/c\/[^"]+)"/)?.[1];
        return Boolean(link);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  // A person, after the first seconds when only scanners click
  await page.waitForTimeout(5500);
  const redirect = await request.get(link!, {
    maxRedirects: 0,
    headers: { "user-agent": CHROME },
  });
  const clickId = new URL(redirect.headers().location!).searchParams.get("tid")!;

  await page.goto(`/w/${slug}/settings/tracking`);
  const postback = await page.getByLabel("Postback URL", { exact: true }).inputValue();
  const fire = (txid: string, payout: string) =>
    request.get(
      postback.replace("{subid}", clickId).replace("{payout}", payout).replace("{txid}", txid),
    );
  expect(await (await fire("R-1", "80.00")).text()).toBe("ok created");

  // The campaign's cost, for ROI
  await page.goto(`/w/${slug}/campaigns/${campaignId}`);
  await page.getByLabel("Campaign cost").fill("20");
  await page.getByRole("button", { name: "Save cost" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  await page.goto(`/w/${slug}`);
  await page.getByRole("link", { name: "Revenue" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/revenue`));
  const totals = page.getByRole("region", { name: "Totals" });
  await expect(totals).toContainText("$80.00");
  await expect(totals).toContainText("1 conversions");
  await expect(totals).toContainText("300%");

  const row = page.getByRole("table", { name: "Revenue by campaigns" }).getByRole("row", {
    name: /Autumn offer/,
  });
  // Sent, clicks, conversions, rate, revenue, EPC, per 1k, ROI
  await expect(row.getByRole("cell")).toHaveText([
    "Autumn offer",
    "1",
    "1",
    "1",
    "100%",
    "$80.00",
    "$80.00",
    "$80,000.00",
    "300%",
  ]);

  // The totals are the conversions table's
  const [workspace] = await getSql()<{ total: number }[]>`
    select coalesce(sum(v.value), 0)::float8 as total from conversions v
    join workspaces w on w.id = v.workspace_id
    where w.slug = ${slug} and v.status = 'approved'`;
  expect(workspace!.total).toBe(80);

  // By link: the ClickBank link
  await page.getByRole("link", { name: "Links" }).click();
  await expect(
    page.getByRole("table", { name: "Revenue by links" }).getByRole("row", { name: /clickbank/ }),
  ).toContainText("$80.00");
});
