-- Slice (k) step 2 (decision 0027): the worker roster. A worker's status (never deleted: employment
-- ends), their SSN sealed with its own data key (only the last four in clear, a keyed index to find a
-- duplicate in the agency), and their documents (kept in the agency's document store).
ALTER TABLE "workers" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "ended_on" date;
--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_status" CHECK (status IN ('active', 'ended') AND (status = 'ended') = (ended_on IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "ssn_sealed" jsonb;
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "ssn_last4" text;
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "ssn_index" text;
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "ssn_changed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_ssn" CHECK (
	(ssn_sealed IS NULL) = (ssn_last4 IS NULL) AND (ssn_last4 IS NULL) = (ssn_index IS NULL)
	AND (ssn_last4 IS NULL OR ssn_last4 ~ '^[0-9]{4}$')
	AND (ssn_index IS NULL OR ssn_index ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
-- One SSN, one worker, in an agency (Toast: a new SSN already on another profile does not save).
CREATE UNIQUE INDEX "workers_ssn_index" ON "workers" ("agency_id", "ssn_index") WHERE "ssn_index" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "worker_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"document_id" uuid NOT NULL REFERENCES "compliance_documents"("id"),
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_by_label" text NOT NULL,
	-- Removing a document unlinks it; the file stays for the record.
	"removed_at" timestamp with time zone,
	"removed_by_label" text,
	CONSTRAINT "worker_documents_kind" CHECK (kind IN ('w4', 'state_w4', 'direct_deposit', 'other'))
);
--> statement-breakpoint
CREATE INDEX "worker_documents_worker" ON "worker_documents" ("agency_id", "worker_id");
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['worker_documents']
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
