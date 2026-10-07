import { defineConfig } from "vitest/config";

// Unit tests only; drivers.int.test.ts needs Mailpit (vitest.integration.config.ts).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], exclude: ["src/**/*.int.test.ts"] },
});
