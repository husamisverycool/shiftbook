-- New Jersey Temporary Workers' Bill of Rights (SPEC §16, §27.10): the Temporary Laborer Assignment
-- Notification (form MW-23) is given to every temporary laborer in a designated classification when
-- sent to an assignment, whatever their language (N.J.S.A. 34:8D-3(a); N.J.A.C. 12:72-3.1). The
-- notice in the worker's own language (nj_language_notice) stays the duty for a language other than
-- English and Spanish (the form is printed in both).
INSERT INTO compliance_rules (code, jurisdiction, area, subject_kind, anchor, offset_days, business_days, remind_days, fixed_dates, soc_groups, roles, citation, source_url, effective_from) VALUES
	('nj_assignment_notice', 'NJ', 'placements', 'assignment', 'start', 0, 0, 0, '{}', '{33,35,37,39,47,49,51,53}', '{coordinator}',
	 'N.J.S.A. 34:8D-3(a); N.J.A.C. 12:72-3.1 (the Temporary Laborer Assignment Notification, form MW-23, when the laborer is sent to the assignment)',
	 'https://www.nj.gov/labor/wageandhour/assets/PDFs/Forms%20and%20Publications/MW-23%20(5-15-23)pkg.pdf', '2024-09-16');
