import { defineConfig } from "vitest/config";

// Unit tests: pure code, no database. Integration tests use vitest.integration.config.ts.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], exclude: ["src/**/*.int.test.ts"] },
});
