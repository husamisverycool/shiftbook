CREATE TYPE "public"."import_status" AS ENUM('draft', 'done');--> statement-breakpoint
CREATE TABLE "placement_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"source" text NOT NULL,
	"filename" text NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"status" "import_status" DEFAULT 'draft' NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decisions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"results" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD COLUMN "assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD COLUMN "markup_bp" integer;--> statement-breakpoint
ALTER TABLE "placement_imports" ADD CONSTRAINT "placement_imports_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_external" ON "assignments" USING btree ("agency_id","external_source","external_id") WHERE "assignments"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "rate_cards_one_start" ON "rate_cards" USING btree ("agency_id","job_order_id",coalesce("assignment_id", '00000000-0000-0000-0000-000000000000'::uuid),"effective_from");--> statement-breakpoint
-- Tenant isolation for the new table, as for every tenant table (0001).
ALTER TABLE placement_imports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE placement_imports FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON placement_imports
  USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON placement_imports TO shiftbook_app;
