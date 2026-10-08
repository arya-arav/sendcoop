-- Every foreign key gets an index (D80). Without one, deleting a parent row
-- scans the whole child table: deleting a workspace with a million messages
-- checked conversions and clicks once per message and never finished.
-- Hand-written (like 0005's trigram index): drizzle's schema doesn't list them.
CREATE INDEX IF NOT EXISTS "invitations_inviter_id_index" ON "invitations" ("inviter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_impersonated_by_index" ON "sessions" ("impersonated_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_active_workspace_id_index" ON "sessions" ("active_workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_imports_created_by_index" ON "subscriber_imports" ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_created_by_index" ON "api_keys" ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_runs_workspace_id_index" ON "automation_runs" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_step_logs_workspace_id_index" ON "automation_step_logs" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clicks_subscriber_id_index" ON "clicks" ("subscriber_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clicks_link_id_index" ON "clicks" ("link_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opens_subscriber_id_index" ON "opens" ("subscriber_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_events_subscriber_id_index" ON "automation_events" ("subscriber_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_sending_domain_id_index" ON "campaigns" ("sending_domain_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_sending_server_id_index" ON "campaigns" ("sending_server_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversions_message_id_index" ON "conversions" ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversions_click_row_id_index" ON "conversions" ("click_row_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_plan_id_index" ON "subscriptions" ("plan_id");
