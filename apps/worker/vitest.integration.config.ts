import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests: real Postgres (DATABASE_URL, migrated) and a temp storage folder.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");
process.env.STORAGE_DIR = join(tmpdir(), `sendcoop-worker-test-${process.pid}`);

export default defineConfig({
  test: { include: ["src/**/*.int.test.ts"], fileParallelism: false },
});
