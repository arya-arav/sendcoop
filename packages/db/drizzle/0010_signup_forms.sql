CREATE TABLE "signup_forms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"button_text" text DEFAULT 'Subscribe' NOT NULL,
	"success_message" text NOT NULL,
	"redirect_url" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"list_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"double_opt_in" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signup_forms" ADD CONSTRAINT "signup_forms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signup_forms_public_id_unique" ON "signup_forms" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "signup_forms_workspace_id_index" ON "signup_forms" USING btree ("workspace_id");