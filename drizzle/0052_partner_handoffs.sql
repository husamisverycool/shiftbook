-- Slice w (SPEC §27 item 9): partner-ready money flows — compute everything, move nothing. A handoff
-- is the record that a payload or packet was prepared and approved for a licensed partner: the kind,
-- what it is about (a run, a worker, an invoice, a range of pay dates), the amount it concerns, a
-- summary for the list, the payload itself (never an SSN or bank details) and its SHA-256. Never
-- changed: the app reads and inserts; only the demo's reset deletes (with the rest of the demo agency).
CREATE TABLE "partner_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"kind" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"partner" text NOT NULL,
	"status" text DEFAULT 'recorded' NOT NULL,
	"amount_cents" integer,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	CONSTRAINT "partner_handoffs_kind" CHECK (kind IN ('payroll', 'wage_access', 'funding', 'insurance')),
	CONSTRAINT "partner_handoffs_subject" CHECK (subject_type IN ('pay_run', 'worker', 'invoice', 'pay_dates')),
	CONSTRAINT "partner_handoffs_partner" CHECK (partner IN ('check', 'zeal', 'file', 'wage_access_partner', 'funding_partner', 'broker')),
	CONSTRAINT "partner_handoffs_status" CHECK (status IN ('recorded')),
	CONSTRAINT "partner_handoffs_amount" CHECK (amount_cents IS NULL OR amount_cents >= 0),
	CONSTRAINT "partner_handoffs_sha" CHECK (payload_sha256 ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE INDEX "partner_handoffs_list" ON "partner_handoffs" ("agency_id", "created_at");
--> statement-breakpoint
CREATE INDEX "partner_handoffs_subject_idx" ON "partner_handoffs" ("agency_id", "kind", "subject_id");
--> statement-breakpoint
-- A run's payroll and an invoice's funding are handed off once.
CREATE UNIQUE INDEX "partner_handoffs_once" ON "partner_handoffs" ("agency_id", "kind", "subject_id") WHERE kind IN ('payroll', 'funding');
--> statement-breakpoint
ALTER TABLE "partner_handoffs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "partner_handoffs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "partner_handoffs" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON partner_handoffs TO shiftbook_app;
