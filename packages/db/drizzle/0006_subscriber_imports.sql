CREATE TYPE "public"."import_status" AS ENUM('draft', 'queued', 'processing', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "subscriber_imports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" uuid,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" bigint NOT NULL,
	"encoding" text NOT NULL,
	"delimiter" text NOT NULL,
	"has_header" boolean NOT NULL,
	"columns" jsonb NOT NULL,
	"sample_rows" jsonb NOT NULL,
	"mapping" jsonb,
	"list_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"update_existing" boolean DEFAULT false NOT NULL,
	"status" "import_status" DEFAULT 'draft' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriber_imports" ADD CONSTRAINT "subscriber_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_imports" ADD CONSTRAINT "subscriber_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriber_imports_workspace_id_id_index" ON "subscriber_imports" USING btree ("workspace_id","id");