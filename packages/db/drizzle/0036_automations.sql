CREATE TYPE "public"."campaign_kind" AS ENUM('broadcast', 'automation');--> statement-breakpoint
CREATE TYPE "public"."automation_run_status" AS ENUM('active', 'waiting', 'completed', 'exited', 'failed');--> statement-breakpoint
CREATE TYPE "public"."automation_status" AS ENUM('draft', 'active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."automation_step_status" AS ENUM('done', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"status" "automation_run_status" DEFAULT 'active' NOT NULL,
	"current_node_id" text,
	"wait_until" timestamp with time zone,
	"trigger_ref" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"exit_reason" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_step_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" "automation_step_status" NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "automation_status" DEFAULT 'draft' NOT NULL,
	"trigger" jsonb NOT NULL,
	"graph" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "messages_campaign_subscriber_unique";--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "kind" "campaign_kind" DEFAULT 'broadcast' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "automation_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "automation_run_id" uuid;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_step_logs" ADD CONSTRAINT "automation_step_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_step_logs" ADD CONSTRAINT "automation_step_logs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_step_logs" ADD CONSTRAINT "automation_step_logs_run_id_automation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_live_unique" ON "automation_runs" USING btree ("automation_id","subscriber_id") WHERE "automation_runs"."status" in ('active', 'waiting');--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_trigger_unique" ON "automation_runs" USING btree ("automation_id","trigger_ref") WHERE "automation_runs"."trigger_ref" is not null;--> statement-breakpoint
CREATE INDEX "automation_runs_status_wait_until_index" ON "automation_runs" USING btree ("status","wait_until");--> statement-breakpoint
CREATE INDEX "automation_runs_subscriber_id_index" ON "automation_runs" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_step_logs_run_node_unique" ON "automation_step_logs" USING btree ("run_id","node_id");--> statement-breakpoint
CREATE INDEX "automation_step_logs_automation_id_node_id_index" ON "automation_step_logs" USING btree ("automation_id","node_id");--> statement-breakpoint
CREATE INDEX "automations_workspace_id_status_index" ON "automations" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_run_campaign_unique" ON "messages" USING btree ("automation_run_id","campaign_id") WHERE "messages"."automation_run_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_campaign_subscriber_unique" ON "messages" USING btree ("campaign_id","subscriber_id") WHERE "messages"."automation_run_id" is null;