-- Slice (l), decision 0032: passkeys. A person's passkeys (WebAuthn credentials: the credential id,
-- the public key, the signature counter; a removed one is kept, marked) and single-use challenges
-- (only the challenge's SHA-256 is kept; five minutes).
--
-- Both are read before the agency is known (a sign-in finds the person from the passkey), so, like
-- user_logins (drizzle/0034), their policy also lets a transaction that switched on app.auth see them
-- across agencies. Only src/server/auth/ does that.
CREATE TABLE "passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL REFERENCES "agencies"("id"),
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" bytea NOT NULL,
	-- The signature counter last seen; a passkey that does not count (a synced one) stays at 0.
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}'::text[] NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	-- WebAuthn: a credential id is at most 1023 bytes (1364 characters of base64url).
	CONSTRAINT "passkeys_credential_id" CHECK (credential_id ~ '^[A-Za-z0-9_-]+$' AND length(credential_id) <= 1366),
	CONSTRAINT "passkeys_public_key" CHECK (octet_length(public_key) BETWEEN 1 AND 4096),
	-- An unsigned 32-bit counter.
	CONSTRAINT "passkeys_counter" CHECK (counter BETWEEN 0 AND 4294967295),
	CONSTRAINT "passkeys_device_type" CHECK (device_type IN ('singleDevice', 'multiDevice')),
	CONSTRAINT "passkeys_name" CHECK (length(name) BETWEEN 1 AND 120),
	-- The passkey belongs to the person in that same agency.
	CONSTRAINT "passkeys_user" FOREIGN KEY ("user_id", "agency_id") REFERENCES "users"("id", "agency_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "passkeys_credential_id_unique" ON "passkeys" ("credential_id");
--> statement-breakpoint
CREATE INDEX "passkeys_user" ON "passkeys" ("user_id");
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	-- Null for a sign-in challenge: nobody is known yet.
	"agency_id" uuid REFERENCES "agencies"("id"),
	"user_id" uuid,
	"purpose" text NOT NULL,
	"challenge_hash" text NOT NULL,
	-- A sign-in challenge: the digest of the visitor's address (open ones are capped per address).
	"address_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "webauthn_challenges_purpose" CHECK (purpose IN ('register', 'sign_in')),
	-- A registration is for one person in one agency; a sign-in for nobody yet.
	CONSTRAINT "webauthn_challenges_who" CHECK ((purpose = 'register' AND user_id IS NOT NULL AND agency_id IS NOT NULL) OR (purpose = 'sign_in' AND user_id IS NULL AND agency_id IS NULL)),
	CONSTRAINT "webauthn_challenges_hash" CHECK (challenge_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "webauthn_challenges_address_hash" CHECK (address_hash IS NULL OR address_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "webauthn_challenges_user" FOREIGN KEY ("user_id", "agency_id") REFERENCES "users"("id", "agency_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "webauthn_challenges_hash_unique" ON "webauthn_challenges" ("challenge_hash");
--> statement-breakpoint
CREATE INDEX "webauthn_challenges_expires" ON "webauthn_challenges" ("expires_at");
--> statement-breakpoint
CREATE INDEX "webauthn_challenges_address" ON "webauthn_challenges" ("address_hash", "created_at") WHERE address_hash IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "passkeys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "passkeys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "passkeys" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on') WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on');
--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "webauthn_challenges" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "webauthn_challenges" USING (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on') WITH CHECK (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid OR current_setting('app.auth', true) = 'on');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON passkeys, webauthn_challenges TO shiftbook_app;
