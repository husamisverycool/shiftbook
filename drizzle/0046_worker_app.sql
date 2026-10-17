-- Slice t (SPEC §27 items 5–6): the Recruiter role, worker onboarding, and the worker app (phone code
-- sign-in, hours, pay stubs, messages, clock in and out).
--
-- Fences: every new agency table has the agency fence; the worker app's transactions also set
-- app.worker_id, and RESTRICTIVE policies then show only that worker's rows on the tables that hold a
-- worker's data (a worker can never read a colleague's hours, pay, messages or forms). The sign-in
-- tables are visible only in sign-in mode (app.auth), as the agency sign-in's are (drizzle/0034).
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'recruiter';
--> statement-breakpoint
-- The worker's mobile number (E.164, US) and a keyed digest that finds it at sign-in without the number.
ALTER TABLE "workers" ADD COLUMN "phone" text;
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "phone_index" text;
--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_phone" CHECK (phone IS NULL OR phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$');
--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_phone_index" CHECK (phone_index IS NULL OR phone_index ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
CREATE UNIQUE INDEX "workers_phone_unique" ON "workers" ("agency_id", "phone_index") WHERE "phone_index" IS NOT NULL;
--> statement-breakpoint
-- Whether a client lets workers clock in from the app, and whether it asks for their location.
ALTER TABLE "clients" ADD COLUMN "worker_clock" text DEFAULT 'off' NOT NULL;
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_worker_clock" CHECK (worker_clock IN ('off', 'on', 'location'));
--> statement-breakpoint
-- One onboarding per worker: each step's answers and when it was done. The I-9 answers (date of birth,
-- document numbers) and the bank details are sealed under the app key, bound to the worker; only the
-- bank account's last four is in clear.
CREATE TABLE "worker_onboarding" (
	"worker_id" uuid PRIMARY KEY NOT NULL REFERENCES "workers"("id"),
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"invited_at" timestamp with time zone,
	"invited_by_label" text,
	"personal" jsonb,
	"personal_at" timestamp with time zone,
	"birth_sealed" jsonb,
	"w4" jsonb,
	"w4_at" timestamp with time zone,
	"i9_sealed" jsonb,
	"i9_status" text,
	"i9_at" timestamp with time zone,
	"payment_kind" text,
	"deposit_sealed" jsonb,
	"deposit_last4" text,
	"payment_at" timestamp with time zone,
	"policies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policies_at" timestamp with time zone,
	"signed_name" text,
	"signed_at" timestamp with time zone,
	"signed_address_hash" text,
	"signed_user_agent" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_onboarding_payment" CHECK (payment_kind IS NULL OR payment_kind IN ('direct_deposit', 'paper_check')),
	CONSTRAINT "worker_onboarding_last4" CHECK (deposit_last4 IS NULL OR deposit_last4 ~ '^[0-9]{4}$'),
	CONSTRAINT "worker_onboarding_i9_status" CHECK (i9_status IS NULL OR i9_status IN ('citizen', 'noncitizen_national', 'permanent_resident', 'authorized_alien')),
	CONSTRAINT "worker_onboarding_signed_name" CHECK (signed_name IS NULL OR length(signed_name) BETWEEN 2 AND 200),
	CONSTRAINT "worker_onboarding_address" CHECK (signed_address_hash IS NULL OR signed_address_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE INDEX "worker_onboarding_agency" ON "worker_onboarding" ("agency_id");
--> statement-breakpoint
-- Sign-in codes sent by text message: no agency yet (a number may be at several agencies), so only
-- sign-in mode sees them. Only the HMAC of the code and the keyed digest of the number are kept.
CREATE TABLE "worker_sign_in_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_index" text NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL,
	-- After a right code for a number at several agencies: the digest of the choice token, for 10 minutes.
	"choice_hash" text,
	"choice_expires_at" timestamp with time zone,
	CONSTRAINT "worker_sign_in_codes_index" CHECK (phone_index ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "worker_sign_in_codes_hash" CHECK (code_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "worker_sign_in_codes_choice" CHECK (choice_hash IS NULL OR choice_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE INDEX "worker_sign_in_codes_phone" ON "worker_sign_in_codes" ("phone_index", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_sign_in_codes_choice_unique" ON "worker_sign_in_codes" ("choice_hash") WHERE "choice_hash" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "worker_sign_in_codes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "worker_sign_in_codes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sign_in_mode ON "worker_sign_in_codes" USING (current_setting('app.auth', true) = 'on') WITH CHECK (current_setting('app.auth', true) = 'on');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON worker_sign_in_codes TO shiftbook_app;
--> statement-breakpoint
-- A worker's signed-in phone or browser (only the token's SHA-256 is kept).
CREATE TABLE "worker_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"token_hash" text NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"user_agent" text,
	CONSTRAINT "worker_sessions_token_hash" CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_sessions_token_hash_unique" ON "worker_sessions" ("token_hash");
--> statement-breakpoint
CREATE INDEX "worker_sessions_worker" ON "worker_sessions" ("agency_id", "worker_id");
--> statement-breakpoint
-- The thread between a worker and their agency; a translation for the other side when the languages differ.
CREATE TABLE "worker_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"sender" text NOT NULL,
	"author_label" text NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"body_locale" text NOT NULL,
	"translation" text,
	"translation_locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_by_worker_at" timestamp with time zone,
	"read_by_agency_at" timestamp with time zone,
	CONSTRAINT "worker_messages_sender" CHECK (sender IN ('worker', 'agency')),
	CONSTRAINT "worker_messages_body" CHECK (length(body) BETWEEN 1 AND 2000),
	CONSTRAINT "worker_messages_locale" CHECK (body_locale IN ('en', 'es') AND (translation_locale IS NULL OR translation_locale IN ('en', 'es')))
);
--> statement-breakpoint
CREATE INDEX "worker_messages_thread" ON "worker_messages" ("agency_id", "worker_id", "created_at");
--> statement-breakpoint
-- A clock-in from the worker app; its clock-out makes a time entry waiting for review (never approved here).
CREATE TABLE "worker_clock_punches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"worker_id" uuid NOT NULL REFERENCES "workers"("id"),
	"assignment_id" uuid NOT NULL REFERENCES "assignments"("id"),
	"clock_in_at" timestamp with time zone NOT NULL,
	"clock_out_at" timestamp with time zone,
	"in_location" jsonb,
	"out_location" jsonb,
	"time_entry_id" uuid REFERENCES "time_entries"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_clock_punches_order" CHECK (clock_out_at IS NULL OR clock_out_at > clock_in_at)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_clock_punches_open" ON "worker_clock_punches" ("agency_id", "worker_id") WHERE "clock_out_at" IS NULL;
--> statement-breakpoint
-- Text messages sent (the code in a sign-in text is never kept); in demo mode the whole text is kept
-- for the demo outbox, as the demo mailbox keeps emails (decision 0012).
CREATE TABLE "sms_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"kind" text NOT NULL,
	"to_phone" text NOT NULL,
	"worker_id" uuid REFERENCES "workers"("id"),
	"body" text NOT NULL,
	"demo_body" text,
	"status" text DEFAULT 'sending' NOT NULL,
	"provider_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "sms_messages_kind" CHECK (kind IN ('sign_in_code', 'onboarding_invite')),
	CONSTRAINT "sms_messages_status" CHECK (status IN ('sending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "sms_messages_agency" ON "sms_messages" ("agency_id", "created_at");
--> statement-breakpoint
ALTER TABLE "worker_onboarding" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "worker_onboarding" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "worker_onboarding" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "worker_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "worker_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "worker_sessions" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on') WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on');
--> statement-breakpoint
ALTER TABLE "worker_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "worker_messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "worker_messages" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "worker_clock_punches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "worker_clock_punches" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "worker_clock_punches" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "sms_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sms_messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sms_messages" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
-- DELETE for the demo's one-click reset (src/server/demo/seed.ts clears the demo agency's rows).
GRANT SELECT, INSERT, UPDATE, DELETE ON worker_onboarding, worker_sessions, worker_messages, worker_clock_punches, sms_messages TO shiftbook_app;
--> statement-breakpoint
-- The worker fence: when a transaction names a worker (the worker app), only that worker's rows.
CREATE POLICY worker_fence ON "workers" AS RESTRICTIVE USING (nullif(current_setting('app.worker_id', true), '') IS NULL OR id = nullif(current_setting('app.worker_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY worker_fence ON "worker_documents" AS RESTRICTIVE USING (nullif(current_setting('app.worker_id', true), '') IS NULL OR worker_id = nullif(current_setting('app.worker_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY worker_fence ON "assignments" AS RESTRICTIVE USING (nullif(current_setting('app.worker_id', true), '') IS NULL OR worker_id = nullif(current_setting('app.worker_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY worker_fence ON "time_entries" AS RESTRICTIVE USING (nullif(current_setting('app.worker_id', true), '') IS NULL OR worker_id = nullif(current_setting('app.worker_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY worker_fence ON "pay_lines" AS RESTRICTIVE USING (nullif(current_setting('app.worker_id', true), '') IS NULL OR worker_id = nullif(current_setting('app.worker_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY worker_fence ON "bill_lines" AS RESTRICTIVE USING (nullif(current_setting('app.worker_id', true), '') IS NULL OR worker_id = nullif(current_setting('app.worker_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY worker_fence ON "worker_onboarding" AS RESTRICTIVE USING (nullif(current_setting('app.worker_id', true), '') IS NULL OR worker_id = nullif(current_setting('app.worker_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY worker_fence ON "worker_sessions" AS RESTRICTIVE USING (nullif(current_setting('app.worker_id', true), '') IS NULL OR worker_id = nullif(current_setting('app.worker_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY worker_fence ON "worker_messages" AS RESTRICTIVE USING (nullif(current_setting('app.worker_id', true), '') IS NULL OR worker_id = nullif(current_setting('app.worker_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY worker_fence ON "worker_clock_punches" AS RESTRICTIVE USING (nullif(current_setting('app.worker_id', true), '') IS NULL OR worker_id = nullif(current_setting('app.worker_id', true), '')::uuid);
--> statement-breakpoint
-- Sign-in by number: a keyed digest gives the active workers with that number, each with their agency, nothing else.
CREATE FUNCTION worker_sign_in_candidates(p_phone_index text) RETURNS TABLE (agency_id uuid, worker_id uuid, agency_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT w.agency_id, w.id, a.name FROM workers w JOIN agencies a ON a.id = w.agency_id
  WHERE w.phone_index = p_phone_index AND w.status = 'active'
  ORDER BY a.name
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION worker_sign_in_candidates(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION worker_sign_in_candidates(text) TO shiftbook_app;
