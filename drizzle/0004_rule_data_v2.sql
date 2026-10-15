-- Rule data v2, after the second-opinion review (2026-10-15) and a minimum-wage verification against
-- primary sources (docs/research/minimum-wage-2026.md).

-- Citation wording: every statute says "not less than".
UPDATE overtime_rules SET citation = 'Illinois Minimum Wage Law, 820 ILCS 105/4a(1) — over 40 hours in a workweek at not less than 1.5x the regular rate' WHERE jurisdiction = 'IL' AND rule_code = 'weekly_overtime';
--> statement-breakpoint
UPDATE overtime_rules SET citation = 'Massachusetts Minimum Fair Wage Law, M.G.L. c. 151, § 1A — over 40 hours in a workweek at not less than 1.5x the regular rate' WHERE jurisdiction = 'MA' AND rule_code = 'weekly_overtime';
--> statement-breakpoint
UPDATE overtime_rules SET citation = 'Cal. Lab. Code § 510(a) — over 40 hours in a workweek at not less than 1.5x the regular rate' WHERE jurisdiction = 'CA' AND rule_code = 'weekly_overtime';
--> statement-breakpoint
UPDATE overtime_rules SET citation = 'Cal. Lab. Code § 510(a) — over 8 hours in a workday at not less than 1.5x the regular rate' WHERE jurisdiction = 'CA' AND rule_code = 'ca_daily_overtime';
--> statement-breakpoint
UPDATE overtime_rules SET citation = 'Cal. Lab. Code § 510(a) — over 12 hours in a workday at not less than 2x the regular rate' WHERE jurisdiction = 'CA' AND rule_code = 'ca_daily_double_time';
--> statement-breakpoint
UPDATE overtime_rules SET citation = 'Cal. Lab. Code § 510(a); IWC Wage Orders § 3(A) — first 8 hours on the seventh day of work in a workweek at not less than 1.5x the regular rate' WHERE jurisdiction = 'CA' AND rule_code = 'ca_seventh_day';
--> statement-breakpoint
INSERT INTO overtime_rules (jurisdiction, rule_code, kind, threshold_minutes, multiplier_num, multiplier_den, earning_type, effective_from, effective_to, citation)
VALUES ('CA', 'ca_seventh_day_double_time', 'seventh_day', 480, 2, 1, 'DT', '2000-01-01', NULL,
        'Cal. Lab. Code § 510(a); IWC Wage Orders § 3(A) — over 8 hours on the seventh day of work in a workweek at not less than 2x the regular rate');
--> statement-breakpoint
INSERT INTO jurisdiction_rules (jurisdiction, county, city, rule_code, effective_from, effective_to, citation)
VALUES
  ('CA', NULL, NULL, 'ca_seventh_day_double_time', '2000-01-01', NULL, 'Cal. Lab. Code § 510(a)'),
  ('US', NULL, NULL, 'minimum_wage', '2000-01-01', NULL, '29 U.S.C. § 206(a)(1)'),
  ('IL', NULL, NULL, 'minimum_wage', '2000-01-01', NULL, '820 ILCS 105/4'),
  ('MA', NULL, NULL, 'minimum_wage', '2000-01-01', NULL, 'M.G.L. c. 151, § 1'),
  ('CA', NULL, NULL, 'minimum_wage', '2000-01-01', NULL, 'Cal. Lab. Code § 1182.12'),
  -- Local ordinances: listed so worksites there are held until the local rule is modeled.
  ('IL', 'Cook', NULL, 'local_minimum_wage', '2000-01-01', NULL, 'Cook County Code § 42-13 (Ord. 16-5768); municipalities may opt out'),
  ('IL', NULL, 'Chicago', 'local_minimum_wage', '2000-01-01', NULL, 'Chicago Municipal Code ch. 6-105');
--> statement-breakpoint
INSERT INTO minimum_wage_rules (jurisdiction, county, city, rate_cents, effective_from, effective_to, citation)
VALUES
  ('US', NULL, NULL, 725, '2009-07-24', NULL, 'Fair Labor Standards Act, 29 U.S.C. § 206(a)(1)(C) — $7.25 per hour'),
  ('IL', NULL, NULL, 1400, '2024-01-01', '2024-12-31', 'Illinois Minimum Wage Law, 820 ILCS 105/4(a)(1) — $14.00 per hour in 2024'),
  ('IL', NULL, NULL, 1500, '2025-01-01', NULL, 'Illinois Minimum Wage Law, 820 ILCS 105/4(a)(1) — $15.00 per hour from January 1, 2025'),
  ('MA', NULL, NULL, 1425, '2022-01-01', '2022-12-31', 'M.G.L. c. 151, § 1 (St. 2018, c. 121) — $14.25 per hour in 2022'),
  ('MA', NULL, NULL, 1500, '2023-01-01', NULL, 'M.G.L. c. 151, § 1 (St. 2018, c. 121) — $15.00 per hour from January 1, 2023'),
  ('CA', NULL, NULL, 1650, '2025-01-01', '2025-12-31', 'Cal. Lab. Code § 1182.12 — $16.50 per hour in 2025'),
  ('CA', NULL, NULL, 1690, '2026-01-01', '2026-12-31', 'Cal. Lab. Code § 1182.12 — $16.90 per hour in 2026'),
  ('CA', NULL, NULL, 1740, '2027-01-01', NULL, 'Cal. Lab. Code § 1182.12 — $17.40 per hour from January 1, 2027 (certified July 31, 2026)');
--> statement-breakpoint
GRANT SELECT ON minimum_wage_rules TO shiftbook_app;
