ALTER TABLE "automations" ADD COLUMN "exit_on_conversion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Conversions start automations ("buys", "lead stage changes") and end
-- sales sequences (exit_on_conversion), through automation_events (D65).
CREATE OR REPLACE FUNCTION sc_automation_conversion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subscriber_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved')
     AND EXISTS (SELECT 1 FROM automations a WHERE a.workspace_id = NEW.workspace_id AND a.status = 'active'
                 AND (a.trigger->>'type' = 'converted' OR a.exit_on_conversion)) THEN
    INSERT INTO automation_events (workspace_id, type, subscriber_id, ref, external_id, payload)
    VALUES (NEW.workspace_id, 'converted', NEW.subscriber_id, NEW.id::text, NEW.id::text,
            jsonb_build_object('conversionId', NEW.id, 'value', NEW.value_base, 'currency', NEW.currency,
                               'campaignId', NEW.campaign_id, 'source', NEW.source, 'event', NEW.event))
    ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.lead_stage IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.lead_stage IS DISTINCT FROM NEW.lead_stage)
     AND EXISTS (SELECT 1 FROM automations a WHERE a.workspace_id = NEW.workspace_id AND a.status = 'active'
                 AND a.trigger->>'type' = 'lead_status' AND a.trigger->>'stage' = NEW.lead_stage::text) THEN
    INSERT INTO automation_events (workspace_id, type, subscriber_id, ref, external_id, payload)
    VALUES (NEW.workspace_id, 'lead_status', NEW.subscriber_id, NEW.id::text,
            NEW.id::text || ':' || NEW.lead_stage::text,
            jsonb_build_object('conversionId', NEW.id, 'stage', NEW.lead_stage, 'value', NEW.value_base))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER conversions_automations AFTER INSERT OR UPDATE OF status, lead_stage, subscriber_id ON conversions
  FOR EACH ROW EXECUTE FUNCTION sc_automation_conversion();
