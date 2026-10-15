-- Slice (c) step 4: California meal- and rest-period premiums, and minimum pay for a short day. The premium (one hour at the regular
-- rate, at most one of each per workday) is dated rule data; a person's confirmation of a missed
-- period is stored per worker, assignment and day (the engine computes, a person confirms).
-- Sources: docs/research/pay-rules-slice-c.md §2 (Cal. Lab. Code § 226.7(c); Ferra; UPS).
CREATE TABLE "premium_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"rule_code" text NOT NULL,
	"premium_minutes" integer NOT NULL,
	"per_workday_max" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"citation" text NOT NULL,
	CONSTRAINT "premium_rules_positive" CHECK (premium_minutes > 0 AND per_workday_max > 0)
);
--> statement-breakpoint
GRANT SELECT ON premium_rules TO shiftbook_app;
--> statement-breakpoint
INSERT INTO premium_rules (jurisdiction, rule_code, premium_minutes, per_workday_max, effective_from, effective_to, citation)
VALUES
  ('CA', 'ca_meal_premium', 60, 1, '2000-01-01', '2026-12-31', 'Cal. Lab. Code § 226.7(c) (version in effect through December 31, 2026) — one additional hour of pay at the regular rate for each workday a meal period is not provided; Ferra v. Loews Hollywood Hotel, LLC (2021) 11 Cal.5th 858; UPS v. Superior Court (2011) 196 Cal.App.4th 57'),
  ('CA', 'ca_meal_premium', 60, 1, '2027-01-01', NULL, 'Cal. Lab. Code § 226.7(c) (version operative January 1, 2027; Stats. 2020, ch. 343) — one additional hour of pay at the regular rate for each workday a meal period is not provided; Ferra; UPS'),
  ('CA', 'ca_rest_premium', 60, 1, '2000-01-01', '2026-12-31', 'Cal. Lab. Code § 226.7(c) (version in effect through December 31, 2026) — one additional hour of pay at the regular rate for each workday a rest period is not provided; Ferra v. Loews Hollywood Hotel, LLC (2021) 11 Cal.5th 858; UPS v. Superior Court (2011) 196 Cal.App.4th 57'),
  ('CA', 'ca_rest_premium', 60, 1, '2027-01-01', NULL, 'Cal. Lab. Code § 226.7(c) (version operative January 1, 2027; Stats. 2020, ch. 343) — one additional hour of pay at the regular rate for each workday a rest period is not provided; Ferra; UPS');
--> statement-breakpoint
CREATE TYPE "public"."confirmation_kind" AS ENUM('meal_period_missed', 'rest_period_missed', 'reported_short');
--> statement-breakpoint
CREATE TABLE "premium_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"assignment_id" uuid NOT NULL REFERENCES "assignments"("id"),
	"work_date" date NOT NULL,
	"kind" "confirmation_kind" NOT NULL,
	-- reported_short: the minutes scheduled that day (California and Massachusetts need them), and
	-- whether the worker was placed at another client the same shift (Illinois day labor).
	"scheduled_minutes" integer,
	"reassigned" boolean DEFAULT false NOT NULL,
	"note" text,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "premium_confirmations_scheduled" CHECK (scheduled_minutes IS NULL OR (scheduled_minutes > 0 AND scheduled_minutes <= 1440))
);
--> statement-breakpoint
CREATE INDEX "premium_confirmations_day" ON "premium_confirmations" USING btree ("agency_id", "worker_id", "work_date");
--> statement-breakpoint
ALTER TABLE premium_confirmations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE premium_confirmations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON premium_confirmations
  USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON premium_confirmations TO shiftbook_app;

--> statement-breakpoint
-- Minimum pay when a worker reports (or is sent) and gets less work than scheduled
-- (docs/research/pay-rules-slice-c.md §2–§4). One rule per state at a time.
ALTER TYPE earning_type ADD VALUE IF NOT EXISTS 'REPORTING_PAY' AFTER 'MW_TRUEUP';
--> statement-breakpoint
CREATE TABLE "guarantee_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"rule_code" text NOT NULL,
	"due_minutes" integer,
	"reassigned_due_minutes" integer,
	"scheduled_fraction_num" integer,
	"scheduled_fraction_den" integer,
	"min_minutes" integer,
	"max_minutes" integer,
	"min_scheduled_minutes" integer,
	"basis" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"citation" text NOT NULL,
	CONSTRAINT "guarantee_rules_basis" CHECK (basis IN ('regular_rate', 'pay_rate'))
);
--> statement-breakpoint
GRANT SELECT ON guarantee_rules TO shiftbook_app;
--> statement-breakpoint
INSERT INTO guarantee_rules (jurisdiction, rule_code, due_minutes, reassigned_due_minutes, scheduled_fraction_num, scheduled_fraction_den, min_minutes, max_minutes, min_scheduled_minutes, basis, effective_from, effective_to, citation)
VALUES
  ('CA', 'ca_reporting_time', NULL, NULL, 1, 2, 120, 240, NULL, 'regular_rate', '2000-01-01', NULL, 'IWC wage orders § 5(A) (e.g. 8 CCR § 11070) — reporting time pay: half the usual or scheduled day''s work, at least two and at most four hours, at the regular rate of pay'),
  ('MA', 'ma_reporting_pay', 180, NULL, NULL, NULL, NULL, NULL, 180, 'pay_rate', '2000-01-01', NULL, '454 CMR 27.04(1) — a worker scheduled for three or more hours who reports and is not given the expected hours is paid for at least three hours, at no less than the minimum wage'),
  ('IL', 'il_day_labor_minimum', 240, 120, NULL, NULL, NULL, NULL, NULL, 'pay_rate', '2000-01-01', NULL, 'Day and Temporary Labor Services Act, 820 ILCS 175/30(g); 56 Ill. Adm. Code 260.450(b) — sent and not utilized: at least 4 hours at the agreed rate; placed elsewhere the same shift: at least 2 hours');
--> statement-breakpoint
-- Illinois day and temporary labor covers light industrial work, not clerical or professional work (820 ILCS 175/5).
ALTER TABLE job_orders ADD COLUMN day_and_temporary_labor boolean DEFAULT true NOT NULL;
