-- A sign-up's email is proved by a six-digit code or the link, whichever comes first (slice ab,
-- onboarding; Slack's and Linear's confirm emails). Only the code's digest is kept (salted with the
-- request's id); five wrong tries end the request, so a code cannot be guessed.
ALTER TABLE "signup_requests" ADD COLUMN "code_hash" text;
--> statement-breakpoint
ALTER TABLE "signup_requests" ADD COLUMN "code_tries" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "signup_requests" ADD CONSTRAINT "signup_requests_code_hash" CHECK (code_hash IS NULL OR code_hash ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "signup_requests" ADD CONSTRAINT "signup_requests_code_tries" CHECK (code_tries BETWEEN 0 AND 5);
--> statement-breakpoint
-- The app counts wrong codes; it still cannot change a code, a link, an email or an expiry (0044). A right
-- code ends this request and starts a fresh one for the password step, by INSERT, as a new link does.
GRANT UPDATE (code_tries) ON signup_requests TO shiftbook_app;
