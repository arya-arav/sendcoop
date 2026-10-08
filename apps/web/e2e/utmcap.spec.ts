import { expect, test } from "@playwright/test";
import { type FakeUtmcap, startFakeUtmcap } from "@sendcoop/utmcap/fake";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

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
});

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
