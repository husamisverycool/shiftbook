-- Slice (k) step 1 (decisions K1–K3): sign-in. A person's status; their login (email, password hash,
-- the sealed authenticator secret, hashed recovery codes, failed attempts); sessions (only the
-- token's SHA-256 is kept); one-time tokens for invites and password resets (digests only).
--
-- These tables are read before the agency is known (a sign-in finds the agency from the email, a
-- request from its session), so their policy also lets a transaction that has switched on
-- app.auth see them across agencies. Only src/server/auth/ does that; everything else sees its own
-- agency as before.
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status" CHECK (status IN ('active', 'invited', 'suspended'));
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_agency" UNIQUE ("id", "agency_id");
--> statement-breakpoint
CREATE TABLE "user_logins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"email" text NOT NULL,
	"password_hash" text,
	"password_changed_at" timestamp with time zone,
	"totp_secret" jsonb,
	-- A new authenticator being set up: it replaces totp_secret only once a code from it is confirmed.
	"totp_pending" jsonb,
	"totp_enabled_at" timestamp with time zone,
	"totp_last_step" bigint,
	"recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	-- Wrong passwords in a day (100 lock the password for an hour); wrong codes counted apart.
	"failed_count" integer DEFAULT 0 NOT NULL,
	"failed_since" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"code_failed_count" integer DEFAULT 0 NOT NULL,
	"code_failed_since" timestamp with time zone,
	"code_failures_in_row" integer DEFAULT 0 NOT NULL,
	"code_locked_until" timestamp with time zone,
	CONSTRAINT "user_logins_email" CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254 AND position('@' in email) > 1),
	-- The login belongs to the person in that same agency.
	CONSTRAINT "user_logins_user" FOREIGN KEY ("user_id", "agency_id") REFERENCES "users"("id", "agency_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_logins_email_unique" ON "user_logins" ("email");
--> statement-breakpoint
-- No foreign key to users: the demo reset seeds the demo people again with the same ids, and their
-- sessions carry on; a session whose person is gone is refused when read.
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"second_step_at" timestamp with time zone,
	-- When the password or a code was last given in this session (a change to how one signs in needs it recent).
	"confirmed_at" timestamp with time zone,
	"code_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"user_agent" text,
	CONSTRAINT "sessions_token_hash" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sessions_user_agent" CHECK (user_agent IS NULL OR length(user_agent) <= 400)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" ("token_hash");
--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" ("user_id");
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_label" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	-- A reset for a person with an authenticator: the code is given before the new password.
	"code_verified_at" timestamp with time zone,
	-- The digest of the cookie of the browser that gave the code: only that browser sets the password.
	"code_proof_hash" text,
	CONSTRAINT "auth_tokens_purpose" CHECK (purpose IN ('invite', 'reset')),
	CONSTRAINT "auth_tokens_token_hash" CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_token_hash_unique" ON "auth_tokens" ("token_hash");
--> statement-breakpoint
ALTER TABLE "user_logins" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_logins" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "user_logins" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on') WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on');
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sessions" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on') WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on');
--> statement-breakpoint
ALTER TABLE "auth_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "auth_tokens" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "auth_tokens" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on') WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on');
--> statement-breakpoint
-- The short throttle on wrong passwords: digests of "email and address" and "address", no agency.
CREATE TABLE "sign_in_failures" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sign_in_failures_key" CHECK (key_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE INDEX "sign_in_failures_key_at" ON "sign_in_failures" ("key_hash", "at");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON user_logins, sessions, auth_tokens TO shiftbook_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON sign_in_failures TO shiftbook_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE sign_in_failures_id_seq TO shiftbook_app;
