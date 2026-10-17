-- New Jersey, after the second-opinion review of 0047 (SPEC §27 item 10).
-- 1. The 2027 minimum wage (NJDOL release of September 29, 2026): $16.48 from January 1, 2027.
UPDATE minimum_wage_rules SET effective_to = '2026-12-31'
WHERE jurisdiction = 'NJ' AND effective_from = '2026-01-01' AND county_fips IS NULL AND place_fips IS NULL;
--> statement-breakpoint
INSERT INTO minimum_wage_rules (jurisdiction, rate_cents, effective_from, effective_to, citation)
VALUES ('NJ', 1648, '2027-01-01', NULL, 'N.J.S.A. 34:11-56a4(a); N.J.A.C. 12:56-3.1 — $16.48 per hour from January 1, 2027 (most employers; NJDOL release of September 29, 2026)');
--> statement-breakpoint
-- 2. The statute's own words: the regular hourly rate.
UPDATE overtime_rules SET citation = 'New Jersey Wage and Hour Law, N.J.S.A. 34:11-56a4(b)(1) — over 40 hours in a week at 1.5x the regular hourly rate'
WHERE jurisdiction = 'NJ' AND rule_code = 'weekly_overtime';
--> statement-breakpoint
-- 3. Sent and not used: four hours at the agreed rate, two when placed elsewhere the same shift.
INSERT INTO guarantee_rules (jurisdiction, rule_code, due_minutes, reassigned_due_minutes, scheduled_fraction_num, scheduled_fraction_den, min_minutes, max_minutes, min_scheduled_minutes, basis, effective_from, effective_to, citation)
VALUES ('NJ', 'nj_sent_not_used', 240, 120, NULL, NULL, NULL, NULL, NULL, 'pay_rate', '2024-09-16', NULL,
  'Temporary Workers'' Bill of Rights, N.J.S.A. 34:8D-6(g) — a temporary laborer sent to a client and not used: at least 4 hours at the agreed rate; placed elsewhere the same shift: at least 2 hours');
--> statement-breakpoint
-- 4. Equal pay from the first day (designated classifications): a duty per placement to confirm the
-- pay rate against the client's comparable employees, as Granite cannot know the client's averages.
INSERT INTO compliance_rules (code, jurisdiction, area, subject_kind, anchor, offset_days, business_days, remind_days, fixed_dates, soc_groups, roles, citation, source_url, effective_from) VALUES
	('nj_equal_pay_check', 'NJ', 'equal_pay', 'assignment', 'start', 0, 0, 7, '{}', '{33,35,37,39,47,49,51,53}', '{}',
	 'N.J.S.A. 34:8D-7(b); N.J.A.C. 12:72-7.2 (no less than the average rate of pay and average cost of benefits, or their cash equivalent, of the client''s employees doing substantially similar work)',
	 'https://pub.njleg.gov/Bills/2022/PL23/10_.HTM', '2024-09-16');
