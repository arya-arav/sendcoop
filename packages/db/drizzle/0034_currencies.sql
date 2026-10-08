CREATE TABLE "fx_rates" (
	"currency" text NOT NULL,
	"day" date NOT NULL,
	"per_eur" numeric(18, 8) NOT NULL,
	CONSTRAINT "fx_rates_currency_day_pk" PRIMARY KEY("currency","day")
);
--> statement-breakpoint
ALTER TABLE "tracking_settings" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversions" ADD COLUMN "fx_rate" numeric(18, 8);--> statement-breakpoint
ALTER TABLE "conversions" ADD COLUMN "value_base" numeric(12, 2) GENERATED ALWAYS AS (round(value * fx_rate, 2)) STORED;--> statement-breakpoint
-- Rate from one currency to another on a day, through the euro: the nearest
-- known day, earlier days first. Null when either currency has no rate.
CREATE OR REPLACE FUNCTION sc_fx_rate(src text, dst text, at timestamptz) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN upper(src) = upper(dst) THEN 1::numeric ELSE
    (CASE WHEN upper(dst) = 'EUR' THEN 1::numeric ELSE
      (SELECT per_eur FROM fx_rates WHERE currency = upper(dst)
       ORDER BY (day <= at::date) DESC, abs(day - at::date) LIMIT 1) END)
    / NULLIF((CASE WHEN upper(src) = 'EUR' THEN 1::numeric ELSE
      (SELECT per_eur FROM fx_rates WHERE currency = upper(src)
       ORDER BY (day <= at::date) DESC, abs(day - at::date) LIMIT 1) END), 0)
  END
$$;--> statement-breakpoint
UPDATE conversions v SET fx_rate = sc_fx_rate(v.currency, coalesce(t.currency, 'USD'), v.created_at)
FROM workspaces w LEFT JOIN tracking_settings t ON t.workspace_id = w.id
WHERE w.id = v.workspace_id;
