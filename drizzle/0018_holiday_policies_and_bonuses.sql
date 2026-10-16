-- Slice (c) step 4: holiday pay under the agency's (or a client's) holiday policy, and bonuses.
-- A holiday policy is agency data, not law: no law here requires holiday pay. The law sets how its
-- pay counts (29 U.S.C. § 207(e)(6); 29 C.F.R. §§ 778.203, 778.218, 778.219). A bonus is entered and
-- classified by a person for one workweek (29 C.F.R. §§ 778.208–778.211; Alvarado v. Dart Container
-- Corp. (2018) 4 Cal.5th 542). Sources: docs/research/pay-rules-slice-c.md.
ALTER TYPE earning_type ADD VALUE IF NOT EXISTS 'HOL_NOT_WORKED' AFTER 'HOL';
--> statement-breakpoint
ALTER TYPE earning_type ADD VALUE IF NOT EXISTS 'BONUS';
--> statement-breakpoint
ALTER TYPE earning_type ADD VALUE IF NOT EXISTS 'BONUS_OT' AFTER 'BONUS';
--> statement-breakpoint
ALTER TYPE confirmation_kind ADD VALUE IF NOT EXISTS 'holiday_not_worked';
--> statement-breakpoint
CREATE TABLE "holiday_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	-- null: the agency's default; a client's own policy wins over it on the client's work.
	"client_id" uuid REFERENCES "clients"("id"),
	"name" text NOT NULL,
	"holiday_dates" date[] NOT NULL,
	-- Pay for hours worked on a holiday as a multiple of the pay rate (1/1: no premium).
	"worked_multiplier_num" integer NOT NULL,
	"worked_multiplier_den" integer NOT NULL,
	-- Minutes paid for a holiday not worked when a person confirms the worker is eligible (0: none).
	"not_worked_minutes" integer DEFAULT 0 NOT NULL,
	-- Bill for hours worked on a holiday as a multiple of the bill rate; null bills them like any hours.
	"bill_worked_multiplier_num" integer,
	"bill_worked_multiplier_den" integer,
	"bill_not_worked" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holiday_policies_name" CHECK (length(btrim(name)) BETWEEN 1 AND 100),
	CONSTRAINT "holiday_policies_dates" CHECK (cardinality(holiday_dates) BETWEEN 1 AND 366),
	CONSTRAINT "holiday_policies_worked" CHECK (worked_multiplier_den > 0 AND worked_multiplier_num >= worked_multiplier_den AND worked_multiplier_num <= 1000 AND worked_multiplier_den <= 1000),
	CONSTRAINT "holiday_policies_not_worked" CHECK (not_worked_minutes BETWEEN 0 AND 1440),
	CONSTRAINT "holiday_policies_bill" CHECK (
		(bill_worked_multiplier_num IS NULL AND bill_worked_multiplier_den IS NULL)
		OR (bill_worked_multiplier_den > 0 AND bill_worked_multiplier_num >= bill_worked_multiplier_den AND bill_worked_multiplier_num <= 1000 AND bill_worked_multiplier_den <= 1000)
	)
);
--> statement-breakpoint
CREATE INDEX "holiday_policies_client" ON "holiday_policies" USING btree ("agency_id", "client_id");
--> statement-breakpoint
ALTER TABLE holiday_policies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE holiday_policies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON holiday_policies
  USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON holiday_policies TO shiftbook_app;
--> statement-breakpoint
CREATE TYPE "public"."bonus_kind" AS ENUM('nondiscretionary', 'flat_sum');
--> statement-breakpoint
CREATE TABLE "bonuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"assignment_id" uuid NOT NULL REFERENCES "assignments"("id"),
	"workweek_start" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"kind" "bonus_kind" NOT NULL,
	"note" text,
	"entered_by" uuid,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bonuses_amount" CHECK (amount_cents > 0 AND amount_cents <= 10000000)
);
--> statement-breakpoint
CREATE INDEX "bonuses_week" ON "bonuses" USING btree ("agency_id", "worker_id", "workweek_start");
--> statement-breakpoint
ALTER TABLE bonuses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bonuses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON bonuses
  USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON bonuses TO shiftbook_app;
