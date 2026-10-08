CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'delivered', 'failed');--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"response_status" integer,
	"error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"url" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"events" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"failure_streak" integer DEFAULT 0 NOT NULL,
	"disabled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_due" ON "webhook_deliveries" USING btree ("next_attempt_at") WHERE "webhook_deliveries"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_id_created_at_index" ON "webhook_deliveries" USING btree ("endpoint_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_workspace_id_index" ON "webhook_endpoints" USING btree ("workspace_id");--> statement-breakpoint
-- Outgoing webhooks (D78): queue a delivery for every enabled endpoint that
-- wants the event. Cheap when a workspace has no endpoints (one index probe).
CREATE FUNCTION sc_webhook_event(ws uuid, ev text, data jsonb) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO webhook_deliveries (endpoint_id, workspace_id, event, payload)
  SELECT e.id, ws, ev,
         jsonb_build_object('event', ev, 'created_at', now(), 'data', data)
  FROM webhook_endpoints e
  WHERE e.workspace_id = ws AND e.enabled AND ev = ANY (e.events);
$$;
--> statement-breakpoint
CREATE FUNCTION sc_subscriber_json(s subscribers) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'email', s.email, 'first_name', s.first_name, 'last_name', s.last_name,
    'status', s.status, 'source', s.source, 'fields', s.fields);
$$;
--> statement-breakpoint
CREATE FUNCTION sc_webhooks_subscribers() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'subscribed' AND (TG_OP = 'INSERT' OR OLD.status <> 'subscribed') THEN
    PERFORM sc_webhook_event(NEW.workspace_id, 'subscriber.subscribed', sc_subscriber_json(NEW));
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'unsubscribed' AND OLD.status <> 'unsubscribed' THEN
    PERFORM sc_webhook_event(NEW.workspace_id, 'subscriber.unsubscribed', sc_subscriber_json(NEW));
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER subscribers_webhooks AFTER INSERT OR UPDATE OF status ON subscribers
FOR EACH ROW EXECUTE FUNCTION sc_webhooks_subscribers();
--> statement-breakpoint
CREATE FUNCTION sc_webhooks_clicks() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- People only: bots and link scanners aren't clicks anyone acts on.
  IF NOT NEW.is_bot THEN
    PERFORM sc_webhook_event(NEW.workspace_id, 'email.clicked', jsonb_build_object(
      'click_id', NEW.click_id,
      'campaign_id', NEW.campaign_id,
      'subscriber_id', NEW.subscriber_id,
      'email', (SELECT email FROM messages WHERE id = NEW.message_id),
      'url', (SELECT url FROM links WHERE id = NEW.link_id),
      'clicked_at', NEW.created_at));
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER clicks_webhooks AFTER INSERT ON clicks
FOR EACH ROW EXECUTE FUNCTION sc_webhooks_clicks();
--> statement-breakpoint
CREATE FUNCTION sc_webhooks_conversions() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM sc_webhook_event(NEW.workspace_id, 'conversion.created', jsonb_build_object(
    'id', NEW.id,
    'event', NEW.event,
    'status', NEW.status,
    'value', NEW.value,
    'currency', NEW.currency,
    'txid', NEW.external_txid,
    'source', NEW.source,
    'click_id', NEW.click_id,
    'campaign_id', NEW.campaign_id,
    'automation_id', NEW.automation_id,
    'subscriber_id', NEW.subscriber_id,
    'email', (SELECT email FROM subscribers WHERE id = NEW.subscriber_id),
    'created_at', NEW.created_at));
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER conversions_webhooks AFTER INSERT ON conversions
FOR EACH ROW EXECUTE FUNCTION sc_webhooks_conversions();
