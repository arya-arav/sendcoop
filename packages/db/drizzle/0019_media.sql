CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"url" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_workspace_key_unique" ON "media" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "media_workspace_id_id_index" ON "media" USING btree ("workspace_id","id");