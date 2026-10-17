-- New Jersey wage rules (SPEC §27 item 10; owner, 2026-10-17). Global reference rows, read-only to the app.
-- New Jersey sets one statewide minimum (no local ordinances); the general rate is used — the
-- separate small-employer (fewer than 6), seasonal and farm schedules do not fit a staffing agency.
INSERT INTO overtime_rules
  (jurisdiction, rule_code, kind, threshold_minutes, multiplier_num, multiplier_den, earning_type, effective_from, effective_to, citation)
VALUES
  ('NJ', 'weekly_overtime', 'weekly', 2400, 3, 2, 'OT', '2000-01-01', NULL,
   'New Jersey Wage and Hour Law, N.J.S.A. 34:11-56a4(b)(1) — over 40 hours in a week at 1.5x the regular hourly wage');
--> statement-breakpoint
INSERT INTO jurisdiction_rules (jurisdiction, rule_code, effective_from, effective_to, citation)
VALUES
  ('NJ', 'weekly_overtime', '2000-01-01', NULL, 'N.J.S.A. 34:11-56a4(b)(1)'),
  ('NJ', 'minimum_wage', '2000-01-01', NULL, 'N.J.S.A. 34:11-56a4(a)');
--> statement-breakpoint
INSERT INTO minimum_wage_rules (jurisdiction, rate_cents, effective_from, effective_to, citation)
VALUES
  ('NJ', 1513, '2024-01-01', '2024-12-31', 'N.J.S.A. 34:11-56a4(a) — $15.13 per hour in 2024 (most employers)'),
  ('NJ', 1549, '2025-01-01', '2025-12-31', 'N.J.S.A. 34:11-56a4(a) — $15.49 per hour in 2025 (most employers)'),
  ('NJ', 1592, '2026-01-01', NULL, 'N.J.S.A. 34:11-56a4(a) — $15.92 per hour from January 1, 2026 (most employers; NJDOL notice of October 1, 2025)');
