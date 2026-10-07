-- Fast "contains" search over subscriber email and name, per workspace.
-- Hand-written: drizzle-kit can't express extensions or this index, and it
-- never drops objects it doesn't know about. Queries must use the exact same
-- expression as searchSubscribers() for Postgres to pick the index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gin;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscribers_search_trgm" ON "subscribers" USING gin (
  "workspace_id",
  (lower("email" || ' ' || coalesce("first_name", '') || ' ' || coalesce("last_name", ''))) gin_trgm_ops
);
