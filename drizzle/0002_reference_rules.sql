-- Reference wage-rule data (SPEC §5: every rate, threshold and multiplier lives in effective-dated
-- data). Global rows: they apply to every agency and are read-only to the app role.
-- Earlier legal history is not modeled; effective_from marks the first date these rows cover.
-- Multipliers are integer fractions (3/2 = 1.5x, 2/1 = 2x). Thresholds are minutes.

INSERT INTO overtime_rules
  (jurisdiction, rule_code, kind, threshold_minutes, multiplier_num, multiplier_den, earning_type, effective_from, effective_to, citation)
VALUES
  ('US', 'weekly_overtime', 'weekly', 2400, 3, 2, 'OT', '2000-01-01', NULL,
   'Fair Labor Standards Act, 29 U.S.C. § 207(a)(1); 29 C.F.R. Part 778 — over 40 hours in a workweek at not less than 1.5x the regular rate'),
  ('IL', 'weekly_overtime', 'weekly', 2400, 3, 2, 'OT', '2000-01-01', NULL,
   'Illinois Minimum Wage Law, 820 ILCS 105/4a — over 40 hours in a workweek at 1.5x the regular rate'),
  ('MA', 'weekly_overtime', 'weekly', 2400, 3, 2, 'OT', '2000-01-01', NULL,
   'Massachusetts Minimum Fair Wage Law, M.G.L. c. 151, § 1A — over 40 hours in a workweek at 1.5x the regular rate'),
  ('CA', 'weekly_overtime', 'weekly', 2400, 3, 2, 'OT', '2000-01-01', NULL,
   'Cal. Lab. Code § 510(a) — over 40 hours in a workweek at 1.5x the regular rate'),
  ('CA', 'ca_daily_overtime', 'daily', 480, 3, 2, 'OT', '2000-01-01', NULL,
   'Cal. Lab. Code § 510(a) — over 8 hours in a workday at 1.5x the regular rate'),
  ('CA', 'ca_daily_double_time', 'daily_double', 720, 2, 1, 'DT', '2000-01-01', NULL,
   'Cal. Lab. Code § 510(a) — over 12 hours in a workday at 2x the regular rate'),
  ('CA', 'ca_seventh_day', 'seventh_day', 0, 3, 2, 'OT', '2000-01-01', NULL,
   'Cal. Lab. Code § 510(a) — first 8 hours on the seventh consecutive workday in a workweek at 1.5x; over 8 at 2x');
--> statement-breakpoint
-- Which rule codes apply where. A worksite state with no rows here is an unknown jurisdiction and
-- blocks the run (SPEC §9). A listed rule the engine does not implement yet also blocks the run.
INSERT INTO jurisdiction_rules (jurisdiction, rule_code, effective_from, effective_to, citation)
VALUES
  ('US', 'weekly_overtime', '2000-01-01', NULL, '29 U.S.C. § 207(a)(1)'),
  ('IL', 'weekly_overtime', '2000-01-01', NULL, '820 ILCS 105/4a'),
  ('MA', 'weekly_overtime', '2000-01-01', NULL, 'M.G.L. c. 151, § 1A'),
  ('CA', 'weekly_overtime', '2000-01-01', NULL, 'Cal. Lab. Code § 510(a)'),
  ('CA', 'ca_daily_overtime', '2000-01-01', NULL, 'Cal. Lab. Code § 510(a)'),
  ('CA', 'ca_daily_double_time', '2000-01-01', NULL, 'Cal. Lab. Code § 510(a)'),
  ('CA', 'ca_seventh_day', '2000-01-01', NULL, 'Cal. Lab. Code § 510(a)');
