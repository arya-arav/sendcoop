import { expect, test } from "@playwright/test";
import { type FakeUtmcap, startFakeUtmcap } from "@sendcoop/utmcap/fake";
import type { Page } from "@playwright/test";
import { closeConnections, sendCampaign } from "./campaigns";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";
import { CHROME, waitForTrackedUrls } from "./tracked";

// The UTMCAP integration (D56–D60) against a fake UTMCAP on the port the
// servers were started with (UTMCAP_API_URL in playwright.config.ts). One
// file, run in order, so only one fake holds the port.

test.describe.configure({ mode: "serial" });

let fake: FakeUtmcap;
test.beforeAll(async () => {
  fake = await startFakeUtmcap({ port: 3009 });
});
test.afterAll(async () => {
  await fake?.close();
  await closeConnections();
});

/** A new workspace with UTMCAP connected; returns its slug. */
async function connected(page: Page, label: string) {
  const slug = await signUpWithWorkspace(page, {
    name: "Tracker User",
    email: uniqueEmail(label),
    workspace: `UTMCAP ${label} ${Date.now()}`,
  });
  await page.goto(`/w/${slug}/integrations`);
  await page.getByLabel("UTMCAP API key").fill(fake.apiKey);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("status")).toContainText("is now a traffic source in UTMCAP");
  return slug;
}

test("connecting UTMCAP sets up the Sendcoop traffic source and webhook there", async ({
  page,
}) => {
  const slug = await signUpWithWorkspace(page, {
    name: "Tracker User",
    email: uniqueEmail("utmcap"),
    workspace: `UTMCAP ${Date.now()}`,
  });
  await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: "Integrations" }).click();
  await expect(page.getByRole("heading", { name: "Integrations", level: 1 })).toBeVisible();

  // A key UTMCAP refuses
  await page.getByLabel("UTMCAP API key").fill("utmk_not_a_real_key");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("UTMCAP didn't accept that API key.")).toBeVisible();
  expect(fake.sources).toEqual([]);

  // The right one: one click
  await page.getByLabel("UTMCAP API key").fill(fake.apiKey);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Connected. “Sendcoop” is now a traffic source in UTMCAP.",
  );
  await expect(page.locator("[data-slot=badge]", { hasText: "Connected" })).toBeVisible();

  // In UTMCAP: the source, with sc_cid as its external id and its postback URL
  expect(fake.sources).toEqual([
    expect.objectContaining({
      name: "Sendcoop",
      external_id_param: "sc_cid",
      token_macros: {
        sub1: "{email_campaign}",
        sub2: "{automation}",
        sub3: "{audience}",
        sub4: "{link}",
      },
      postback_url: expect.stringMatching(
        /^http:\/\/localhost:3001\/pb\/utmcap\?key=ut_\w{32}&sc_cid=\{external_id\}&ucid=\{utmcap_id\}&payout=\{payout\}&status=\{status\}$/,
      ),
    }),
  ]);
  // ...and the webhook for conversion changes
  expect(fake.webhooks).toEqual([
    expect.objectContaining({
      url: expect.stringMatching(/^http:\/\/localhost:3001\/wh\/utmcap\/ut_\w{32}$/),
      events: ["conversion.created", "conversion.updated"],
    }),
  ]);
  // Creating went with idempotency keys, so a retry can't make two
  expect(fake.requests.filter((r) => r.method === "POST").every((r) => r.idempotencyKey)).toBe(
    true,
  );
  await page.reload();
  await expect(page.getByText(fake.sources[0]!.id)).toBeVisible();
  void slug;
});

test("a UTMCAP link inserted in the editor reaches UTMCAP with the click id and the email's details", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const slug = await connected(page, "utmcap-link");
  const offer = fake.addCampaign("Keto VSL");

  // Insert it in a template from the editor
  await page.goto(`/w/${slug}/templates/new`);
  await page.getByRole("button", { name: "Write HTML" }).click();
  await expect(page.getByRole("status").first()).toHaveText("All changes saved", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Insert UTMCAP link" }).click();
  await page
    .getByRole("list", { name: "UTMCAP campaigns" })
    .getByRole("button", { name: /Keto VSL/ })
    .click();
  await expect(page.getByRole("textbox", { name: "HTML code" })).toContainText(
    `<a href="${offer.url}">Keto VSL</a>`,
  );
  await page.getByLabel("Template name").fill("Keto email");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").first()).toHaveText("All changes saved");
  const templateId = page.url().split("/").pop()!;

  // Sent in a campaign, then clicked by a reader
  const reader = uniqueEmail("utmcap-reader");
  // A campaign from a template is named after it: sub1 is "keto-email"
  await sendCampaign(slug, [reader], { templateId });
  const { links } = await waitForTrackedUrls(reader);
  await page.waitForTimeout(5500);
  const hop = await request.get(links[0]!, { headers: { "user-agent": CHROME }, maxRedirects: 0 });
  const toUtmcap = new URL(hop.headers().location!);
  expect(`${toUtmcap.origin}${toUtmcap.pathname}`).toBe(offer.url);
  const scCid = toUtmcap.searchParams.get("sc_cid")!;
  expect(scCid).toMatch(/^sc\w{16}$/);
  expect(toUtmcap.searchParams.has("utm_source")).toBe(false);
  await request.get(toUtmcap.toString(), { maxRedirects: 0 });

  // In UTMCAP's click log: the external id and the sub values
  const click = fake.clicks.at(-1)!;
  expect(click).toMatchObject({
    campaign_id: offer.id,
    external_id: scCid,
    subs: { sub1: "keto-email", sub3: expect.stringMatching(/^deals-/), sub4: "keto-vsl" },
  });
  expect(fake.sources.find((s) => s.id === click.source_id)?.external_id_param).toBe("sc_cid");
});

/** Sends a campaign whose email links to the UTMCAP campaign, and clicks it like a person. */
async function clickThrough(
  page: Page,
  request: import("@playwright/test").APIRequestContext,
  slug: string,
  offerUrl: string,
  name: string,
) {
  const reader = uniqueEmail("utmcap-reader");
  const { campaignId } = await sendCampaign(slug, [reader], {
    name,
    html: `<html><body><a href="${offerUrl}">See the offer</a></body></html>`,
  });
  const { links } = await waitForTrackedUrls(reader);
  await page.waitForTimeout(5500);
  const hop = await request.get(links[0]!, {
    headers: { "user-agent": CHROME },
    maxRedirects: 0,
  });
  await request.get(hop.headers().location!, { maxRedirects: 0 });
  const click = fake.clicks.at(-1)!;
  return { campaignId, ucid: click.click_id, scCid: click.external_id! };
}

test("a conversion in UTMCAP comes back by postback and shows on the Sendcoop campaign", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const slug = await connected(page, "utmcap-postback");
  const offer = fake.addCampaign("Solar leads");
  const { campaignId, ucid } = await clickThrough(page, request, slug, offer.url, "June solar");

  // UTMCAP records the sale and calls the Sendcoop source's postback
  const { postback } = await fake.convert(ucid, { conversionId: "SOL-1", payout: 55 });
  expect(postback).toMatch(
    /^http:\/\/localhost:3001\/pb\/utmcap\?key=ut_\w{32}&sc_cid=sc\w{16}&ucid=\w+&payout=55&status=approved$/,
  );

  await page.goto(`/w/${slug}/campaigns/${campaignId}`);
  await expect(
    page
      .getByRole("region", { name: "Results" })
      .locator("[data-slot=card]")
      .filter({ has: page.getByText("Revenue", { exact: true }) }),
  ).toContainText("$55.00");
  await page.goto(`/w/${slug}/settings/tracking`);
  await expect(
    page
      .locator("[data-slot=card]", { hasText: "Recent conversions" })
      .getByRole("row")
      .filter({ hasText: "UTMCAP" }),
  ).toContainText("June solar");

  // The same postback again counts once
  expect(await (await request.get(postback!)).text()).toBe("ok duplicate");
});
