-- Decision 0033: Google, Microsoft, an agency's own single sign-on, and emailed sign-in codes.
--
-- user_identities: an identity at a provider (its issuer and subject) linked to one Shiftbook person;
-- at most one per provider per person (Vercel's login connections), and one person per identity while
-- it is not removed (a disconnected one is kept for the record). email_sign_in_codes: six-digit codes,
-- only their HMAC kept. Both are read before the agency is known (a provider's sign-in finds the
-- person from the identity, a code from the email), so their policy, like user_logins', also admits a
-- transaction in sign-in mode (app.auth); only src/server/auth/ sets it.
--
-- agency_sso: an agency's OpenID Connect provider (issuer, client ID, the client secret sealed under
-- the app key and bound to the agency, its last four characters), on or off. Read only inside the
-- agency (the person, then their agency, are known first): the ordinary agency fence.
--
-- sessions.first_factor: how the session began (password, google, microsoft, sso, email_code…), so
-- the log of its second step names it.
CREATE TABLE "user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	-- The email the provider gave when it was linked (shown on Your account; never a key).
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	CONSTRAINT "user_identities_provider" CHECK (provider IN ('google', 'microsoft', 'sso')),
	CONSTRAINT "user_identities_issuer" CHECK (length(issuer) BETWEEN 1 AND 500),
	CONSTRAINT "user_identities_subject" CHECK (length(subject) BETWEEN 1 AND 255),
	CONSTRAINT "user_identities_email" CHECK (email IS NULL OR (email = lower(email) AND length(email) <= 254)),
	CONSTRAINT "user_identities_user" FOREIGN KEY ("user_id", "agency_id") REFERENCES "users"("id", "agency_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_issuer_subject" ON "user_identities" ("issuer", "subject") WHERE "removed_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_user_provider" ON "user_identities" ("user_id", "provider") WHERE "removed_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "email_sign_in_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"user_id" uuid NOT NULL,
	-- HMAC-SHA256 of the row id and the code under a key derived from the app key.
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "email_sign_in_codes_hash" CHECK (code_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "email_sign_in_codes_failures" CHECK (failures BETWEEN 0 AND 5),
	CONSTRAINT "email_sign_in_codes_user" FOREIGN KEY ("user_id", "agency_id") REFERENCES "users"("id", "agency_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "email_sign_in_codes_user" ON "email_sign_in_codes" ("user_id", "created_at");
--> statement-breakpoint
CREATE TABLE "agency_sso" (
	"agency_id" uuid PRIMARY KEY NOT NULL REFERENCES "agencies"("id"),
	"enabled" boolean DEFAULT false NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" jsonb NOT NULL,
	"secret_last4" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_label" text NOT NULL,
	CONSTRAINT "agency_sso_issuer" CHECK (length(issuer) BETWEEN 1 AND 300),
	CONSTRAINT "agency_sso_client_id" CHECK (length(client_id) BETWEEN 1 AND 255),
	CONSTRAINT "agency_sso_last4" CHECK (length(secret_last4) <= 4)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "first_factor" text;
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_first_factor" CHECK (first_factor IS NULL OR first_factor ~ '^[a-z_]{1,40}$');
--> statement-breakpoint
ALTER TABLE "user_identities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_identities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "user_identities" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on') WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on');
--> statement-breakpoint
ALTER TABLE "email_sign_in_codes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "email_sign_in_codes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "email_sign_in_codes" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on') WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on');
--> statement-breakpoint
ALTER TABLE "agency_sso" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agency_sso" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "agency_sso" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid) WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON user_identities, email_sign_in_codes, agency_sso TO shiftbook_app;
