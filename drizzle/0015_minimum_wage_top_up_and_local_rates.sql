-- Slice (c) step 2: a rate card below the minimum wage is topped up on its own pay line (instead of
-- holding the week), and the Chicago and Cook County minimum wages are modeled as dated local rates
-- (docs/research/minimum-wage-2026.md; docs/research/pay-rules-slice-c.md §4). Both ordinances are
-- applied whenever a worksite is inside them: Chicago's 4-employee threshold is met by any staffing
-- agency, and Cook County's rate applies unless a municipality's opt-out is on file (none is; the
-- county publishes no list) — paying the county rate where it might not apply is lawful, paying less
-- where it does is not.
ALTER TYPE earning_type ADD VALUE IF NOT EXISTS 'MW_TRUEUP' AFTER 'DT';
--> statement-breakpoint
UPDATE jurisdiction_rules SET rule_code = 'minimum_wage', citation = 'Cook County Minimum Wage Ordinance, Cook County Code § 42-13 (Ord. 16-5768)' WHERE jurisdiction = 'IL' AND county_fips = '17031' AND place_fips IS NULL AND rule_code = 'local_minimum_wage';
--> statement-breakpoint
UPDATE jurisdiction_rules SET rule_code = 'minimum_wage', citation = 'Chicago Minimum Wage Ordinance, Chicago Municipal Code ch. 6-105' WHERE jurisdiction = 'IL' AND place_fips = '1714000' AND county_fips IS NULL AND rule_code = 'local_minimum_wage';
--> statement-breakpoint
INSERT INTO minimum_wage_rules (jurisdiction, county_fips, place_fips, scope_name, rate_cents, effective_from, effective_to, citation)
VALUES
  ('IL', NULL, '1714000', 'City of Chicago', 1660, '2025-07-01', '2026-06-30', 'Chicago Municipal Code ch. 6-105; OLS Rule MW 2.01 — $16.60 per hour from July 1, 2025 (employers with 4 or more employees)'),
  ('IL', NULL, '1714000', 'City of Chicago', 1705, '2026-07-01', NULL, 'Chicago Municipal Code ch. 6-105; OLS Rule MW 2.01 — $17.05 per hour from July 1, 2026 (employers with 4 or more employees)'),
  ('IL', '17031', NULL, 'Cook County', 1500, '2025-07-01', '2026-06-30', 'Cook County Code § 42-13 — $15.00 per hour from July 1, 2025 (held at the state rate)'),
  ('IL', '17031', NULL, 'Cook County', 1540, '2026-07-01', NULL, 'Cook County Code § 42-13 — $15.40 per hour from July 1, 2026');
