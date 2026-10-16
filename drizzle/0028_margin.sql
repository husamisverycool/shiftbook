-- Slice (i) margin analytics (plan .claude/plans/slice-i-margin.md, decisions I2, I3, I10).
-- Employer taxes as one rate per state (TempWorks Initial Burden), in parts per million of pay
-- (11.75% = 117500); a row with no state applies to every other state. Kept by date: a new rate
-- starts on a date and ends the one before it (Bullhorn workers' comp codes: start and end).
CREATE TABLE "burden_tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"state" text,
	"rate_ppm" integer NOT NULL,
	"includes" text,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "burden_tax_rates_rate" CHECK (rate_ppm >= 0 AND rate_ppm <= 1000000),
	CONSTRAINT "burden_tax_rates_state" CHECK (state IS NULL OR state ~ '^[A-Z]{2}$'),
	CONSTRAINT "burden_tax_rates_dates" CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "burden_tax_rates_start" ON "burden_tax_rates" ("agency_id", coalesce("state", ''), "effective_from");
--> statement-breakpoint
-- Workers' comp by state and class code, per dollar of pay in parts per million ($4.00 per $100 of
-- pay = 40000), kept by date like the taxes (Bullhorn: state, code, name, rate, start, end).
CREATE TABLE "wc_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"state" text NOT NULL,
	"class_code" text NOT NULL,
	"description" text,
	"rate_ppm" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "wc_rates_rate" CHECK (rate_ppm >= 0 AND rate_ppm <= 1000000),
	CONSTRAINT "wc_rates_state" CHECK (state ~ '^[A-Z]{2}$'),
	CONSTRAINT "wc_rates_code" CHECK (length(class_code) BETWEEN 1 AND 12),
	CONSTRAINT "wc_rates_dates" CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "wc_rates_start" ON "wc_rates" ("agency_id", "state", "class_code", "effective_from");
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['burden_tax_rates','wc_rates']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid) WITH CHECK (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid)',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO shiftbook_app', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- The recruiter whose placement it is (Bullhorn User Scorecard groups gross profit by recruiter).
ALTER TABLE "assignments" ADD COLUMN "recruiter_user_id" uuid REFERENCES "users"("id");
--> statement-breakpoint
-- The office whose margin the order counts in (Bullhorn gross margin by branch: the job owner's).
ALTER TABLE "job_orders" ADD COLUMN "branch_id" uuid REFERENCES "branches"("id");
