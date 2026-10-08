CREATE TABLE "admin_activity" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"admin_id" uuid,
	"action" text NOT NULL,
	"target_id" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_activity" ADD CONSTRAINT "admin_activity_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_activity_created_at_index" ON "admin_activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_activity_admin_id_index" ON "admin_activity" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_activity_target_id_index" ON "admin_activity" USING btree ("target_id");