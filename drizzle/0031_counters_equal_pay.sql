-- Slice (j) step 3 (plan .claude/plans/slice-j-compliance.md "Step 3 in detail"; decisions J5, J6).
--
-- Hours a worker did for a client before Shiftbook. The Illinois equal-pay counter and the run count
-- them on the date they run to (the safe reading: as late as they could have been worked, so they stay
-- in the 12- and 48-month windows longest). Never edited; a wrong one is removed by the Owner with a
-- reason and stays on file.
CREATE TABLE "hours_opening_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"client_id" uuid NOT NULL REFERENCES "clients"("id"),
	"minutes" integer NOT NULL,
	"through_on" date NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_label" text,
	"removed_reason" text,
	-- At most every hour of four years: a typing check, not a rule.
	CONSTRAINT "hours_opening_balances_minutes" CHECK (minutes > 0 AND minutes <= 2102400),
	CONSTRAINT "hours_opening_balances_note" CHECK (length(note) BETWEEN 1 AND 500),
	CONSTRAINT "hours_opening_balances_removed" CHECK ((removed_at IS NULL) = (removed_reason IS NULL) AND (removed_reason IS NULL OR length(removed_reason) BETWEEN 1 AND 500))
);
--> statement-breakpoint
CREATE INDEX "hours_opening_balances_pair" ON "hours_opening_balances" ("agency_id", "worker_id", "client_id");
--> statement-breakpoint
-- The Illinois equal-pay rate for a worker at a client, from a date (820 ILCS 175/42(a), (b)): the
-- client's figures — the comparable direct hire's straight-time rate (or the closest-seniority direct
-- hire's, or the BLS OEWS median or 75th percentile when the client chose that method) and the hourly
-- cash value of benefits paid in lieu of them — or only that the client was asked on that date. The
-- run pays at least the rate plus the benefits' value from the date. Never edited: replaced by a new
-- row, the old one kept as removed.
CREATE TABLE "equal_pay_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"client_id" uuid NOT NULL REFERENCES "clients"("id"),
	"effective_from" date NOT NULL,
	"kind" text NOT NULL,
	"rate_cents" integer,
	"benefits_cents" integer,
	"method" text,
	-- Who the rate was compared with: the direct hire's job and seniority, or the survey's SOC code and area.
	"comparator" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_label" text,
	CONSTRAINT "equal_pay_rates_kind" CHECK (kind IN ('rate', 'asked')),
	CONSTRAINT "equal_pay_rates_method" CHECK (method IS NULL OR method IN ('comparator', 'closest_seniority', 'survey_median', 'survey_75th')),
	CONSTRAINT "equal_pay_rates_figures" CHECK (
		(kind = 'rate' AND rate_cents BETWEEN 1 AND 10000000 AND benefits_cents BETWEEN 0 AND 10000000 AND method IS NOT NULL AND length(comparator) BETWEEN 1 AND 300)
		OR (kind = 'asked' AND rate_cents IS NULL AND benefits_cents IS NULL AND method IS NULL AND comparator IS NULL)
	),
	CONSTRAINT "equal_pay_rates_note" CHECK (note IS NULL OR length(note) BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "equal_pay_rates_live" ON "equal_pay_rates" ("agency_id", "worker_id", "client_id", "effective_from") WHERE "removed_at" IS NULL;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hours_opening_balances','equal_pay_rates']
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
