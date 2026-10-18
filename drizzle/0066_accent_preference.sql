-- A person's accent colour (decision 0046; Linear's and GitHub's per-person appearance): indigo by default.
ALTER TABLE "users" ADD COLUMN "accent" text NOT NULL DEFAULT 'indigo';
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_accent" CHECK (accent IN ('indigo', 'blue', 'teal', 'graphite'));
