CREATE TYPE "public"."sending_server_type" AS ENUM('smtp', 'ses');--> statement-breakpoint
CREATE TABLE "sending_servers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "sending_server_type" NOT NULL,
	"summary" text NOT NULL,
	"config_encrypted" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sending_servers" ADD CONSTRAINT "sending_servers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sending_servers_workspace_id_index" ON "sending_servers" USING btree ("workspace_id");