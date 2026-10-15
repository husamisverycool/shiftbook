CREATE TABLE "minimum_wage_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"county" text,
	"city" text,
	"rate_cents" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"citation" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jurisdiction_rules" ADD COLUMN "county" text;--> statement-breakpoint
ALTER TABLE "jurisdiction_rules" ADD COLUMN "city" text;