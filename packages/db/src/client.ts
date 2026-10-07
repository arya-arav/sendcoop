import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reuse one pool per process; Next.js dev reloads modules, so keep it on globalThis.
const globalForDb = globalThis as typeof globalThis & { __sendcoopSql?: postgres.Sql };

export function getSql(): postgres.Sql {
  if (!globalForDb.__sendcoopSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__sendcoopSql = postgres(url, { max: 10, connect_timeout: 5 });
  }
  return globalForDb.__sendcoopSql;
}

export function getDb() {
  return drizzle(getSql(), { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof getDb>;

export async function pingDatabase(): Promise<boolean> {
  try {
    await getSql()`select 1`;
    return true;
  } catch {
    return false;
  }
}
