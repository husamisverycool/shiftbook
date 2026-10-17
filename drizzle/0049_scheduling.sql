-- Slice u (SPEC §27 item 7; decision 0041): scheduling and shift fill.
--
-- shifts: one shift of one job order on one day, from start_minute to end_minute (minutes after the
-- day's midnight; an overnight shift ends after 1440), less an unpaid break. Open (no worker), assigned,
-- awaiting the worker's confirmation, confirmed, or cancelled. Unpublished while published_at is null or
-- older than changed_at (When I Work's pending changes). A schedule never makes a time entry (SPEC §6).
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"job_order_id" uuid NOT NULL REFERENCES "job_orders"("id"),
	"work_date" date NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"worker_id" uuid REFERENCES "workers"("id"),
	"assignment_id" uuid REFERENCES "assignments"("id"),
	"state" text NOT NULL,
	"require_confirmation" boolean DEFAULT true NOT NULL,
	"confirm_by" timestamp with time zone,
	"published_at" timestamp with time zone,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- Why an open shift needs a look: the worker declined it, or did not answer in time (Deputy).
	"warning" text,
	"warning_worker_id" uuid REFERENCES "workers"("id"),
	"warning_reason" text,
	"no_show" boolean DEFAULT false NOT NULL,
	"replaces_shift_id" uuid REFERENCES "shifts"("id"),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_minutes" CHECK (start_minute BETWEEN 0 AND 1439 AND end_minute > start_minute AND end_minute <= start_minute + 1440 AND break_minutes >= 0 AND break_minutes < end_minute - start_minute),
	CONSTRAINT "shifts_state" CHECK (state IN ('open', 'assigned', 'awaiting', 'confirmed', 'cancelled')),
	CONSTRAINT "shifts_worker_state" CHECK ((state = 'open') = (worker_id IS NULL) OR state = 'cancelled'),
	CONSTRAINT "shifts_warning" CHECK (warning IS NULL OR warning IN ('declined', 'expired')),
	CONSTRAINT "shifts_warning_reason" CHECK (warning_reason IS NULL OR length(warning_reason) BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE INDEX "shifts_week" ON "shifts" ("agency_id", "work_date");
--> statement-breakpoint
CREATE INDEX "shifts_worker" ON "shifts" ("agency_id", "worker_id", "work_date");
--> statement-breakpoint
ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shifts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "shifts" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON shifts TO shiftbook_app;
--> statement-breakpoint
-- shift_offers: an open published shift offered to an eligible worker (Deputy "send offers"); the first
-- to accept takes it and the other offers are withdrawn.
CREATE TABLE "shift_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"shift_id" uuid NOT NULL REFERENCES "shifts"("id") ON DELETE CASCADE,
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"status" text DEFAULT 'offered' NOT NULL,
	"reason" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_offers_status" CHECK (status IN ('offered', 'accepted', 'declined', 'withdrawn')),
	CONSTRAINT "shift_offers_reason" CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shift_offers_one" ON "shift_offers" ("shift_id", "worker_id");
--> statement-breakpoint
CREATE INDEX "shift_offers_worker" ON "shift_offers" ("agency_id", "worker_id", "status");
--> statement-breakpoint
ALTER TABLE "shift_offers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shift_offers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "shift_offers" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON shift_offers TO shiftbook_app;
