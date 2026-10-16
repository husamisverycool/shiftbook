-- Slice (c) step 5: the Illinois equal-pay counter (820 ILCS 175/42) and the obligations it records.
-- Every number of the counter is a dated rule row; an obligation is agency data, one per worker,
-- client and threshold (once crossed, the duty does not reset). Sources: docs/research/pay-rules-slice-c.md §4.
CREATE TABLE "equal_pay_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"rule_code" text NOT NULL,
	"counts_from" date NOT NULL,
	"warn_minutes" integer NOT NULL,
	"window_months" integer NOT NULL,
	"trigger_minutes" integer NOT NULL,
	"long_window_months" integer NOT NULL,
	"long_trigger_minutes" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"citation" text NOT NULL,
	CONSTRAINT "equal_pay_rules_numbers" CHECK (
		warn_minutes > 0 AND warn_minutes < trigger_minutes AND trigger_minutes < long_trigger_minutes
		AND window_months BETWEEN 1 AND 120 AND long_window_months BETWEEN window_months AND 120
	)
);
--> statement-breakpoint
GRANT SELECT ON equal_pay_rules TO shiftbook_app;
--> statement-breakpoint
INSERT INTO equal_pay_rules (jurisdiction, rule_code, counts_from, warn_minutes, window_months, trigger_minutes, long_window_months, long_trigger_minutes, effective_from, effective_to, citation)
VALUES ('IL', 'il_dtlsa_equal_pay', '2024-04-01', 36000, 12, 43200, 48, 249600, '2024-08-09', NULL, '820 ILCS 175/42(a) (P.A. 103-1030, eff. 2024-08-09) — equal pay and benefits (or their hourly cash value, § 42(b)) after more than 720 hours at the same third party client within a 12-month period, counting work on or after April 1, 2024; § 42(a)(2)(B), (c): more than 4,160 hours within a 48-month period; 56 Ill. Adm. Code 260.445, 260.505(b) — the client''s data is due before the next pay period begins. The 600-hour heads-up is Shiftbook''s (SPEC §9), not law.');
--> statement-breakpoint
CREATE TYPE "public"."obligation_kind" AS ENUM('il_equal_pay_720h', 'il_equal_pay_4160h');
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"kind" "obligation_kind" NOT NULL,
	"jurisdiction" text NOT NULL,
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"client_id" uuid NOT NULL REFERENCES "clients"("id"),
	-- The run whose hours crossed the threshold (recomputing that run replaces it).
	"pay_run_id" uuid REFERENCES "pay_runs"("id"),
	"crossed_on" date NOT NULL,
	"due_on" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"evidence" jsonb NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	"done_by" uuid,
	CONSTRAINT "obligations_status" CHECK (status IN ('open', 'done')),
	CONSTRAINT "obligations_once" UNIQUE ("agency_id", "kind", "worker_id", "client_id")
);
--> statement-breakpoint
CREATE INDEX "obligations_due" ON "obligations" USING btree ("agency_id", "status", "due_on");
--> statement-breakpoint
ALTER TABLE obligations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE obligations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON obligations
  USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON obligations TO shiftbook_app;
