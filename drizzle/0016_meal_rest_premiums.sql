-- Slice (c) step 4a: California meal- and rest-period premiums. The premium (one hour at the regular
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
CREATE TYPE "public"."confirmation_kind" AS ENUM('meal_period_missed', 'rest_period_missed');
--> statement-breakpoint
CREATE TABLE "premium_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"assignment_id" uuid NOT NULL REFERENCES "assignments"("id"),
	"work_date" date NOT NULL,
	"kind" "confirmation_kind" NOT NULL,
	"note" text,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
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
