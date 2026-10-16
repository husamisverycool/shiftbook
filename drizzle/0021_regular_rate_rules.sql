-- Slice (c) second opinion on step 4: the multiple at and above which premium pay (a worked-holiday
-- premium) stays out of the regular rate is a dated rule row, not a number in the code (CLAUDE.md).
CREATE TABLE "regular_rate_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"rule_code" text NOT NULL,
	"multiplier_num" integer NOT NULL,
	"multiplier_den" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"citation" text NOT NULL,
	CONSTRAINT "regular_rate_rules_multiplier" CHECK (multiplier_den > 0 AND multiplier_num >= multiplier_den AND multiplier_num <= 1000 AND multiplier_den <= 1000)
);
--> statement-breakpoint
GRANT SELECT ON regular_rate_rules TO shiftbook_app;
--> statement-breakpoint
INSERT INTO regular_rate_rules (jurisdiction, rule_code, multiplier_num, multiplier_den, effective_from, effective_to, citation)
VALUES ('US', 'premium_excluded_from_regular_rate', 3, 2, '2000-01-01', NULL, '29 U.S.C. § 207(e)(6) — a premium rate for work on holidays, Saturdays, Sundays or regular days of rest of not less than one and one-half times the rate for like work on other days stays out of the regular rate; a smaller premium counts in it (29 C.F.R. § 778.203); California follows (DLSE Enforcement Manual 49.1.2.4)');
