ALTER TABLE "campaigns" ADD COLUMN "audience" jsonb DEFAULT '{"everyone":false,"lists":[],"segments":[],"excludeLists":[],"excludeSegments":[]}'::jsonb NOT NULL;--> statement-breakpoint
-- Existing campaigns keep their list or segment.
UPDATE "campaigns" SET "audience" = jsonb_build_object(
  'everyone', false,
  'lists', CASE WHEN "list_id" IS NULL THEN '[]'::jsonb ELSE jsonb_build_array("list_id") END,
  'segments', CASE WHEN "segment_id" IS NULL THEN '[]'::jsonb ELSE jsonb_build_array("segment_id") END,
  'excludeLists', '[]'::jsonb,
  'excludeSegments', '[]'::jsonb
);
