import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

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
  workers: isCI ? undefined : 4,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    channel: process.env.PW_CHANNEL || undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI runs the production build; locally reuse `pnpm dev` if it's already up.
    command: isCI ? "pnpm start" : "pnpm dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
