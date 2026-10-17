-- Decision 0033, after its security review: emailed codes serve three purposes — signing in, proving
-- the mailbox before a provider's identity is first linked at sign-in (review H2a), and "confirm it's
-- you" for a person with no password and no authenticator (review L3). A code works only for its own
-- purpose.
ALTER TABLE "email_sign_in_codes" ADD COLUMN "purpose" text DEFAULT 'sign_in' NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_sign_in_codes" ADD CONSTRAINT "email_sign_in_codes_purpose" CHECK (purpose IN ('sign_in', 'link', 'confirm'));
--> statement-breakpoint
CREATE INDEX "email_sign_in_codes_user_purpose" ON "email_sign_in_codes" ("user_id", "purpose", "created_at");
--> statement-breakpoint
-- The demo's stand-in identity provider is reached in-process at a fixed reserved address (review H1),
-- no longer at the app's own address.
UPDATE "agency_sso" SET "issuer" = 'https://identity.demo.shiftbook.invalid/sso' WHERE "issuer" = '/api/demo/idp/sso';
