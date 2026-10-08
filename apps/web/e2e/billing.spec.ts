import { expect, test } from "@playwright/test";
import { getSql } from "@sendcoop/db";
import { closeConnections } from "./campaigns";
import { type FakeStripe, startFakeStripe } from "./fake-stripe";
import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const run = Date.now().toString(36);
const LIMITS = { subscribers: 2000, sendsPerMonth: 20000, workspaces: 1, teamMembers: 2 };
const FEATURES = {
  automations: true,
  abTests: true,
  aiAssist: false,
  utmcap: true,
  api: false,
  removeBranding: false,
};
let stripe: FakeStripe;

// One fake Stripe, on a fixed port: these tests share it.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  stripe = await startFakeStripe();
  const sql = getSql();
  for (const [key, name, cents] of [
    [`e2e-basic-${run}`, `Basic ${run}`, 1500],
    [`e2e-plus-${run}`, `Plus ${run}`, 3500],
  ] as const) {
    await sql`insert into plans (key, name, price_cents, stripe_price_id, limits, features, sort_order)
              values (${key}, ${name}, ${cents}, ${`price_${key}`},
                      ${JSON.stringify(LIMITS)}::text::jsonb, ${JSON.stringify(FEATURES)}::text::jsonb, 90)`;
  }
});

test.afterAll(async () => {
  const sql = getSql();
  await sql`delete from subscriptions where plan_id in (select id from plans where key like ${`e2e-%-${run}`})`;
  await sql`delete from plans where key like ${`e2e-%-${run}`}`;
  await stripe.close();
  await closeConnections();
});

test("an owner subscribes through Checkout, upgrades, and cancels in the portal", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const slug = await signUpWithWorkspace(page, {
    name: "Billing Owner",
    email: uniqueEmail("billing"),
    workspace: `Billing ${Date.now()}`,
  });
  const plan = page.getByRole("heading", { level: 2 });
  await page.goto(`/w/${slug}/settings/billing`);
  await expect(plan).toHaveText("Free");

  // Subscribe: Stripe's Checkout page, then back here on the new plan.
  await page.getByRole("button", { name: `Choose Basic ${run}` }).click();
  await expect(page.getByRole("heading", { name: "Fake Checkout" })).toBeVisible();
  await page.getByRole("button", { name: "Pay" }).click();
  await expect(page).toHaveURL(/settings\/billing\?session_id=cs_test_/);
  await expect(plan).toHaveText(`Basic ${run}`);
  await expect(page.getByText(/renews/)).toBeVisible();
  expect(stripe.webhooks.every((w) => w.status === 200)).toBe(true);

  // Upgrade: the same subscription, on the other price.
  await page.getByRole("button", { name: `Switch to Plus ${run}` }).click();
  await expect(page.getByRole("status")).toHaveText(`You're now on Plus ${run}.`);
  await expect(plan).toHaveText(`Plus ${run}`);
  const [sub] = [...stripe.subscriptions.values()];
  expect(stripe.subscriptions.size).toBe(1);
  expect(sub!.items.data[0]!.price.id).toBe(`price_e2e-plus-${run}`);

  // Cancel in the portal: paid up until the end of the period.
  await page.getByRole("button", { name: "Manage billing" }).click();
  await page.getByRole("button", { name: "Cancel plan" }).click();
  await expect(page).toHaveURL(/settings\/billing$/);
  await expect(page.getByText(/ends \d/)).toBeVisible();
  await expect(plan).toHaveText(`Plus ${run}`);

  // The period ends: back on the free plan.
  await stripe.endSubscription(sub!.id);
  await page.reload();
  await expect(plan).toHaveText("Free");
});

test("webhooks without a valid Stripe signature are refused", async ({ request }) => {
  const res = await request.post("/api/webhooks/stripe", {
    headers: { "stripe-signature": "t=1,v1=00" },
    data: { type: "customer.subscription.deleted", data: { object: { id: "sub_x" } } },
  });
  expect(res.status()).toBe(400);
});
