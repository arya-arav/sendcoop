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
    stripe.prices.set(`price_${key}`, cents);
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
  const plan = page.getByRole("heading", { level: 2 }).first();
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
  await expect(plan).toHaveText(`Plus ${run}`);
  const [sub] = [...stripe.subscriptions.values()];
  expect(stripe.subscriptions.size).toBe(1);
  expect(sub!.items.data[0]!.price.id).toBe(`price_e2e-plus-${run}`);

  // Both charges are on the billing page, from Stripe's invoice webhooks.
  await page.reload();
  const invoices = page.getByRole("table", { name: "Invoices" });
  await expect(invoices).toContainText("$15.00");
  await expect(invoices).toContainText("$35.00");

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

test("a super-admin sees subscriptions and invoices, and cancels one", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const customer = uniqueEmail("billing-admin-seen");
  await signUpWithWorkspace(page, {
    name: "Paying Customer",
    email: customer,
    workspace: `Paying ${Date.now()}`,
  });
  await page.goto(page.url() + "/settings/billing");
  await page.getByRole("button", { name: `Choose Basic ${run}` }).click();
  await page.getByRole("button", { name: "Pay" }).click();
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(`Basic ${run}`);

  const context = await browser.newContext();
  const admin = await context.newPage();
  const adminEmail = uniqueEmail("billing-admin");
  await signUpWithWorkspace(admin, {
    name: "Billing Admin",
    email: adminEmail,
    workspace: `Billing admin ${Date.now()}`,
  });
  await getSql()`update users set role = 'admin' where email = ${adminEmail}`;

  await admin.goto(`/admin/invoices?q=${encodeURIComponent(customer)}`);
  await expect(admin.getByRole("table", { name: "Invoices" })).toContainText("$15.00");
  await admin.goto(`/admin/subscriptions?q=${encodeURIComponent(customer)}`);
  const subscriptions = admin.getByRole("table", { name: "Subscriptions" });
  await expect(subscriptions).toContainText(`Basic ${run}`);
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: `Actions for ${customer}` }).click();
  await admin.getByRole("menuitem", { name: "Cancel now" }).click();
  await expect(admin.getByRole("status")).toHaveText("Canceled: they're on the free plan now.");

  await page.reload();
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("Free");
  await context.close();
});

test("webhooks without a valid Stripe signature are refused", async ({ request }) => {
  const res = await request.post("/api/webhooks/stripe", {
    headers: { "stripe-signature": "t=1,v1=00" },
    data: { type: "customer.subscription.deleted", data: { object: { id: "sub_x" } } },
  });
  expect(res.status()).toBe(400);
});
