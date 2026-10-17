-- The hosted start's key check (decision 0035): an HMAC of a fixed label made with the encryption key.
-- A start whose key gives another value refuses to run instead of sealing new data with the wrong key,
-- and a start that finds the check but no key never makes a new one. One row at most; the schema owner
-- reads and writes it, the app has no grant.
CREATE TABLE "host_key_check" (
	"id" smallint PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
	"check_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
REVOKE ALL ON "host_key_check" FROM shiftbook_app;
