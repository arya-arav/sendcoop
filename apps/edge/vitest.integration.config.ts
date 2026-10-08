import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Integration tests: real Postgres (DATABASE_URL, migrated).
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

export default defineConfig({
  test: { include: ["src/**/*.int.test.ts"], fileParallelism: false },
});
