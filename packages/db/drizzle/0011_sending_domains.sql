CREATE TYPE "public"."sending_domain_status" AS ENUM('pending', 'verified', 'failed');--> statement-breakpoint
CREATE TABLE "sending_domains" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"dkim_selector" text NOT NULL,
	"dkim_public_key" text NOT NULL,
	"dkim_private_key_encrypted" text NOT NULL,
	"status" "sending_domain_status" DEFAULT 'pending' NOT NULL,
	"spf_verified" boolean DEFAULT false NOT NULL,
	"dkim_verified" boolean DEFAULT false NOT NULL,
	"dmarc_verified" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sending_domains_workspace_domain_unique" ON "sending_domains" USING btree ("workspace_id","domain");--> statement-breakpoint
CREATE INDEX "sending_domains_status_last_checked_at_index" ON "sending_domains" USING btree ("status","last_checked_at");