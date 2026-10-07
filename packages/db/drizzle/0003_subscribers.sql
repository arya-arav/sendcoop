CREATE TYPE "public"."subscriber_source" AS ENUM('manual', 'import', 'form', 'api', 'integration');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('subscribed', 'pending', 'unsubscribed', 'bounced', 'complained');--> statement-breakpoint
CREATE TABLE "list_memberships" (
	"list_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_memberships_list_id_subscriber_id_pk" PRIMARY KEY("list_id","subscriber_id")
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"status" "subscriber_status" DEFAULT 'subscribed' NOT NULL,
	"source" "subscriber_source" DEFAULT 'manual' NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"subscribed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "list_memberships" ADD CONSTRAINT "list_memberships_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_memberships" ADD CONSTRAINT "list_memberships_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_memberships_subscriber_id_index" ON "list_memberships" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_workspace_email_unique" ON "subscribers" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "subscribers_workspace_id_id_index" ON "subscribers" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "subscribers_workspace_id_status_index" ON "subscribers" USING btree ("workspace_id","status");