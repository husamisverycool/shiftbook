-- Slice (j) step 3c: the ACA look-back measurement method (plan .claude/plans/slice-j-compliance.md
-- decision J8; research docs/research/compliance-slice-j.md §6).
--
-- The limits of 26 C.F.R. § 54.4980H, as dated reference data (read by the app, never written by it):
-- standard and initial measurement periods of 3 to 12 months, an administrative period of at most 90
-- days, a stability period of at least 6 months and no shorter than the measurement period, full-time
-- at 30 hours a week on average (1,800 minutes), a break in service of 13 weeks.
CREATE TABLE "aca_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"min_measurement_months" integer NOT NULL,
	"max_measurement_months" integer NOT NULL,
	"max_admin_days" integer NOT NULL,
	"min_stability_months" integer NOT NULL,
	"full_time_minutes_per_week" integer NOT NULL,
	"break_weeks" integer NOT NULL,
	"citation" text NOT NULL,
	"source_url" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	CONSTRAINT "aca_rules_numbers" CHECK (min_measurement_months BETWEEN 1 AND max_measurement_months AND max_measurement_months <= 24 AND max_admin_days BETWEEN 0 AND 365 AND min_stability_months BETWEEN 1 AND 24 AND full_time_minutes_per_week BETWEEN 1 AND 10080 AND break_weeks BETWEEN 1 AND 104),
	CONSTRAINT "aca_rules_dates" CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "aca_rules_start" ON "aca_rules" ("effective_from");
--> statement-breakpoint
GRANT SELECT ON aca_rules TO shiftbook_app;
--> statement-breakpoint
INSERT INTO aca_rules (min_measurement_months, max_measurement_months, max_admin_days, min_stability_months, full_time_minutes_per_week, break_weeks, citation, source_url, effective_from) VALUES
	(3, 12, 90, 6, 1800, 13,
	 '26 C.F.R. § 54.4980H-1(a) (full-time: at least 30 hours of service a week; a standard measurement period of at least three and not more than 12 consecutive months); § 54.4980H-3(c)(4)(i) (13 weeks with no hour of service is a break), (d)(1)(iii) (a stability period of at least six months and no shorter than the measurement period), (d)(1)(vi) (an administrative period of up to 90 days), (d)(3)(vi)(B) (the initial period and its administrative period end by the first calendar month beginning on or after the first anniversary)',
	 'https://www.ecfr.gov/current/title-26/chapter-I/subchapter-D/part-54/section-54.4980H-3', '2015-01-01');
--> statement-breakpoint
-- Hours of service before Shiftbook, one row per worker and month (an import); a newer import of the
-- same month replaces the older row, kept as replaced.
CREATE TABLE "aca_monthly_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"month" date NOT NULL,
	"minutes" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	"replaced_at" timestamp with time zone,
	CONSTRAINT "aca_monthly_hours_month" CHECK (extract(day from month) = 1),
	-- At most every hour of a month: a typing check, not a rule.
	CONSTRAINT "aca_monthly_hours_minutes" CHECK (minutes BETWEEN 0 AND 44640),
	CONSTRAINT "aca_monthly_hours_source" CHECK (length(source) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "aca_monthly_hours_live" ON "aca_monthly_hours" ("agency_id", "worker_id", "month") WHERE "replaced_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "aca_monthly_hours" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "aca_monthly_hours" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "aca_monthly_hours" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON aca_monthly_hours TO shiftbook_app;
--> statement-breakpoint
-- The duty: offer coverage by the end of the administrative period to each worker measured full-time
-- (so it is in place on the first day of the stability period).
INSERT INTO compliance_rules (code, jurisdiction, area, subject_kind, anchor, offset_days, business_days, remind_days, fixed_dates, soc_groups, roles, citation, source_url, effective_from) VALUES
	('aca_offer', 'US', 'aca', 'worker', 'date', 0, 0, 30, '{}', '{}', '{}',
	 '26 U.S.C. § 4980H; 26 C.F.R. § 54.4980H-3(d) (a worker measured full-time is treated as full-time for the stability period: offer coverage from its first day)',
	 'https://www.ecfr.gov/current/title-26/chapter-I/subchapter-D/part-54/section-54.4980H-3', '2015-01-01');
