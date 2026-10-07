// Applies pending migrations from ./drizzle. Used by `pnpm db:migrate` locally
// and by deploys, so production runs exactly the same step.
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

try {
  await migrate(drizzle(sql), { migrationsFolder });
  console.log("[db] migrations applied");
} finally {
  await sql.end();
}
