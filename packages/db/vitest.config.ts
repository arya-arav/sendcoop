import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Integration tests run against a real Postgres (DATABASE_URL), migrated first.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

export default defineConfig({
  test: {
    include: ["src/**/*.int.test.ts"],
    // Tests share one database; run files one at a time.
    fileParallelism: false,
  },
});
