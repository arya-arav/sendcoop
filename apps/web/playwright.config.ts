import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Some tests set up data directly (e.g. a campaign before the builder exists).
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const isCI = Boolean(process.env.CI);

// The UTMCAP tests run a fake UTMCAP on this port (e2e/utmcap.ts); the servers
// started here inherit it. Locally, start `pnpm dev` with the same variable.
process.env.UTMCAP_API_URL ??= "http://127.0.0.1:3009/api/v1";
// AI assist goes to a fake Claude API (e2e/fake-anthropic.ts) with a fake key.
process.env.ANTHROPIC_BASE_URL ??= "http://127.0.0.1:3010";
process.env.ANTHROPIC_API_KEY ??= "sk-ant-e2e-fake";
// Billing goes to a fake Stripe (e2e/fake-stripe.ts).
process.env.STRIPE_API_BASE ??= "http://127.0.0.1:3011";
process.env.STRIPE_SECRET_KEY ??= "sk_test_e2e_fake";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_e2e_fake";
// Outgoing webhooks go to a local test endpoint (e2e/webhooks.spec.ts).
process.env.SENDCOOP_ALLOW_PRIVATE_WEBHOOKS ??= "1";

// Needs Postgres, Redis and Mailpit running (`pnpm services:up` locally,
// service containers in CI). Locally, set PW_CHANNEL=msedge to use the
// installed Edge instead of downloading Playwright's Chromium.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Locally the tests hit `pnpm dev`, which compiles pages on demand; more
  // parallel browsers than this make it time out. CI runs a production build.
  workers: isCI ? undefined : 2,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    channel: process.env.PW_CHANNEL || undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The web app, the worker (imports and sending) and the edge app (click
  // redirects). CI runs production builds;
  // locally an already-running `pnpm dev` is reused.
  webServer: [
    {
      command: isCI ? "pnpm start" : "pnpm dev",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @sendcoop/worker ${isCI ? "start" : "dev"}`,
      url: "http://localhost:3002/health",
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      // Click redirects (tracked links in sent emails).
      command: `pnpm --filter @sendcoop/edge ${isCI ? "start" : "dev"}`,
      url: "http://localhost:3001/health",
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
