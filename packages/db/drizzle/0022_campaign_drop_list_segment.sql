ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_list_id_lists_id_fk";
--> statement-breakpoint
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_segment_id_segments_id_fk";
--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN "list_id";--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN "segment_id";