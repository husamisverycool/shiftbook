-- A person's appearance (decision 0046): System by default, Light or Dark (Geist, GitHub, Linear).
ALTER TABLE "users" ADD COLUMN "appearance" text NOT NULL DEFAULT 'system';
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_appearance" CHECK (appearance IN ('system', 'light', 'dark'));
